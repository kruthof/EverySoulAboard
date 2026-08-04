#!/usr/bin/env node
// ⭐⭐ M3-13 / EVERY THAW REFUSAL REACHES THE SCREEN, WITH A NUMBER — the package's acceptance
// script, driven in real Chrome against the running game so a reviewer re-runs it instead of
// re-typing it. Sibling of `pod-bay-shot.mjs` (M3-4) and `blocked-reach-shot.mjs` (M1-D); it reuses
// their CDP scaffolding deliberately rather than inventing a third.
//
// THE THREE ACCEPTANCE STEPS, in the charter's own words (§5 "M3-13", as re-cut by the OD-N box):
//   0. On a fresh game, before repairing anything ELSE: repair `term_moss` (the opening beat), open
//      MOSS, type `pods` → the bay answers with a REASON, in words. Nothing is silent.
//   1. Right-click a capsule in the Room Zoom → NO Prioritise entry. It is never serviceable.
//   2. Order a repair whose consumable the ship does not have → the tile's `blocked` badge names
//      the ITEM (`NEEDS PARTS — …`), not the generic `NO PARTS OR SEALS ABOARD`. ⭐ THAT DIFFERENCE
//      IS THE PROTOCOL CHANGE: the sixth tuple element reaching a player's eyes.
//
// WHAT ONLY THIS TOOL CAN SEE. `BlockedChannelTests`/`PrioritiseOrderTests` drive the host and the
// sim; `blocked-model.test.js`/`prioritise-menu.test.js` drive the models and a DOM stub. None of
// them can see (a) that the badge's new sentence FITS its badge box in the real stylesheet, (b) that
// the capsule refusal reaches a real toast over the real Room Zoom, or (c) that step 2's state is
// reachable AT ALL by playing — which is the half of this package a unit test can only assume.
//
// ⚠️⚠️ TWO THINGS ARE DRIVEN RATHER THAN PLAYED, AND BOTH ARE SAID OUT LOUD.
//
//  (1) THE RIGHT-CLICK IS A DISPATCHED `contextmenu` EVENT, NOT A CDP MOUSE BUTTON. Measured by
//      M3-4 and re-confirmed here: CDP's synthetic right button does NOT raise `contextmenu` in
//      headless Chrome. That matters MORE than usual for this step, because M3-13's expected result
//      is "no menu opens" — a gesture that silently never fires would produce a CONFIDENT PASS for
//      the wrong reason (TRAPS 3, the FALSE RED's mirror). ⇒ the event is dispatched through the
//      page (`el.dispatchEvent(new MouseEvent('contextmenu', …))`, which reaches the surface's real
//      bubble-phase listener), AND STEP 1 REFUSES TO PASS WITHOUT ITS CONTROL: the identical
//      gesture on a SERVICEABLE machine must OPEN the menu in the same run. Without the control
//      this step is worth nothing and it exits non-zero saying so.
//
//  (2) THE DIRECT ORDER IS SENT AS ITS OWN WIRE MESSAGE — `{cmd:'prioritise',…}`, byte for byte
//      what the Room Zoom's menu row emits (`roomzoom-view.js`, pinned by
//      `client/test/prioritise-menu.test.js` including the capture-phase argument). `pod-bay-shot.mjs`
//      took the same route for the same measured reason. The SIM plays everything after it.
//
// ⛔ AND ONE THING IS NOT FAKED AT ALL, WHICH IS THE POINT OF STEP 2. The ship is the shipping
// wreck, with its authored 8 Parts + 10 Seals aboard (it read "1 Parts + 10 Seals" until D7,
// 2026-08-03, added the seven-crate `cabin stores`). REPAIR is switched on in the WORK tab (a real
// player click) and the maintenance board spends and carries the stock down — the behaviour M3-4
// FILED, measured twice. No defs overlay, no planted state, no item removed by this tool.
// ⚠️ AND THE STATE IS NOT REACHED IN THE OPENING STATE, MEASURED 2026-08-04 RATHER THAN PREDICTED.
// It is a CONJUNCTION of three things and no single one of them is a wall: the reserve stops the
// UNORDERED drain at 4 loose units, every REACHABLE wrecked machine has been serviced by then, and
// the machines that are left are behind the pressure frontier — so a direct order, which DOES spend
// the reserve, has nowhere to spend it. Step 2a is therefore a PACING REPORT that says so with its
// own numbers. Read STEP 2's own note before trusting or re-chasing it — the wait budget is not the
// missing piece, and neither is the reserve.
//
// ⚠️ STEP 2 IS IN TWO HALVES, AND THEY CLAIM DIFFERENT THINGS.
//   2a PLAYS toward the state (REPAIR on, the board spends the stock) and reports honestly whether
//      it got there inside its budget. THE EMISSION is owned by
//      `PrioritiseOrderTests.TheNoConsumableRow_NamesTheItemTheOrderIsWaitingFor`, which drives a
//      real session over the shipping wreck and reddens under the charter's mutation 3.
//   2b INJECTS the row through the CLIENT'S OWN dispatch (`blocked-shot.mjs`'s documented technique;
//      the host is not modified) and proves THE RENDER — that the sentence reaches the visible key
//      box in the real stylesheet, that it CHANGED (the 5-element row is drawn first, in the same
//      run, as the before picture), and that an unnameable item degrades rather than printing
//      `undefined`. Only a browser can claim that, and it claims nothing about the host.
//
// USAGE
//   1. ~/.dotnet/dotnet run --project hosts/web -- --port 8394 --ship wreck
//      python3 client/serve.py 8395
//   2. node client/tools/thaw-blocked-shot.mjs --out docs/design/shots
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / pod-bay-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8394');
const CLIENT_PORT = +arg('client-port', '8395');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'thawblocked-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9367');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };
/** ⚠️ AN OBSERVATION, NOT A CHECK — it is REPORTED and it does NOT fail the run. Used for exactly
 *  one thing (step 2a), and the distinction is stated where it is used rather than assumed here: a
 *  leg whose claim is owned by a gate test, and whose only extra content is "…and it is reachable
 *  by playing, in this long", must not be able to turn a green package red on a pacing wobble. It
 *  must also not be able to hide: every OBSERVE line prints its own numbers. */
const observe = (ok, what) => { log((ok ? '  OBSERVED   ' : '  NOT REACHED  ') + what); return ok; };
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };

// ───────────────────────────── 1. the sim's own truth, on an INDEPENDENT socket (never the page)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
if (!latest.get('devices')?.cells?.length) die(2, 'no devices channel on the wire');

// ── the wire vocabularies this tool reads, mirrored from hosts/web/WireFormat.Blocked.cs and
//    sim/Sim.Core/Entities/{Device,ItemStack}.cs. Restated here rather than imported: this file is a
//    tool, not a client module, and the assertions below are about what a PLAYER sees.
const ORDER_REPAIR = 3;
const REASON_NO_CONSUMABLE = 2;
const DETAIL_NONE = -1;
const KIND_CRYOPOD = 27;
const ITEM_PARTS = 5, ITEM_SEALS = 7, ITEM_SWARF = 9;
const MOSS_XY = [1, 3];                       // term_moss (AuthoredShips.cs — the cryo bay's west wall)

const devicesOf = (deck) => (latest.get('devices')?.cells || []).filter((c) => (c[2] | 0) === deck);
const deviceAt = (x, y, deck) => (latest.get('devices')?.cells || [])
  .find((c) => c[0] === x && c[1] === y && (c[2] | 0) === deck);
const mossCond = () => deviceAt(MOSS_XY[0], MOSS_XY[1], 0)?.[4] ?? -1;
const blockedRows = () => (latest.get('blocked')?.cells || []);
/** Loose (uncarried, unreserved) repair consumables are NOT on the `items` channel as such — the
 *  channel carries ground stacks, which is exactly what "loose" means for `FindNearest`. */
const looseConsumables = () => (latest.get('items')?.cells || [])
  .filter((c) => [ITEM_PARTS, ITEM_SEALS, ITEM_SWARF].includes(c[3] | 0))
  .reduce((n, c) => n + (c[4] | 0), 0);

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'thaw-blocked-shot-'));
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
if (!wsUrl) { chrome.kill('SIGKILL'); die(5, 'Chrome never opened a DevTools endpoint'); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' });
  if (!r.result?.data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name); writeFileSync(p, Buffer.from(r.result.data, 'base64')); log('  wrote', p);
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** One TRUSTED keystroke (OD-P: the MOSS console is a terminal, every printable character types). */
async function key(k) {
  const printable = k.length === 1;
  const base = { key: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : (k === 'Escape' ? 27 : k.toUpperCase().charCodeAt(0)) };
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
const escape = async () => { for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(350); } };

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
// THE ONBOARDING CARD, DISMISSED AND VERIFIED GONE (shared helper, 2026-08-03). The one-shot
// this replaces could SILENTLY SKIP a card that had not painted yet, and every click below
// then landed on a full-screen modal instead of the ship.
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ══════════════════════════════════════════════════════════ STEP 0 — the bay answers, in words
//
// ⚠️ RE-CUT BY OD-N, and the charter's own amendment box says so: a fresh game's MOSS is DARK
// (`term_moss` boots at 0.14, under Terminal's `maint` 0.20), so "before repairing anything" is not
// reachable as written. It is "before repairing anything ELSE": ONE direct order, the opening beat,
// and then the console answers. What the answer IS depends on the third OD-N state — a
// repaired-but-uncommissioned console refuses the BAY and must say so in words rather than draw an
// empty screen. That refusal is the one this run witnesses (commissioning costs a ControllerModule
// the wreck does not carry; `pod-bay-shot.mjs` reaches the commissioned bay behind a disclosed
// price overlay, and this tool deliberately does not repeat that).
log('\nSTEP 0a — a DARK ship refuses `pods` in the SHIP\'s own words, not with an empty screen');
const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) die(7, 'no MOSS tab on the Overview');
await clickAt(mossTab.x, mossTab.y); await sleep(2500);
const box0 = await centre('.moss-input');
if (box0) await clickAt(box0.x, box0.y);
await sleep(400);
const t0 = await prompt('pods');
const e0 = errLines(t0);
log('  transcript(err):', JSON.stringify(e0.slice(-2)));
check(e0.length > 0, 'the dark console REFUSED IN WORDS — nothing was silent');
check((await screenNow()) !== 'podbay', 'and no empty POD BAY was drawn beside the refusal');

log('\nSTEP 0b — repair term_moss with ONE direct order (the opening beat), then ask again');
await escape();
const spd = await centre('[data-ov-speed-up]');
for (let i = 0; i < 2; i++) { if (spd) { await clickAt(spd.x, spd.y); await sleep(250); } }
const cid = latest.get('roster')?.crew?.[0]?.cid;
check(!!cid, 'the roster names the one soul aboard (cid ' + cid + ')');
ws.send(JSON.stringify({ cmd: 'prioritise', cid, x: MOSS_XY[0], y: MOSS_XY[1], deck: 0 }));
log('  term_moss cond at boot:', mossCond(), '/255');
let lit = false;
for (let i = 0; i < 1600 && !lit; i++) {
  await sleep(250);
  if (mossCond() >= 52) lit = true;             // 0.20 maint ⇒ 51/255
  if (i % 80 === 79) log('    …', ((i + 1) / 4) | 0, 's, term_moss cond =', mossCond());
}
check(lit, 'ONE ORDER put term_moss above its `maintain` floor (cond ' + mossCond() + '/255)');

const mossTab2 = await centre('[data-ov-tab="moss"]');
if (mossTab2) { await clickAt(mossTab2.x, mossTab2.y); await sleep(2000); }
const box1 = await centre('.moss-input');
if (box1) await clickAt(box1.x, box1.y);
await sleep(400);
const t0b = await prompt('pods');
const e0b = errLines(t0b);
log('  transcript(err):', JSON.stringify(e0b.slice(-2)));
check(e0b.some((s) => /CONTROLLER MODULE/.test(s)),
  '⭐ the REPAIRED-but-uncommissioned console names COMMISSIONING and the module it needs — the '
  + 'refusal the OD-N split created, in words');
check(!e0b.slice(-1).some((s) => /OFFLINE/.test(s)),
  'and it is no longer the DARK sentence — the two tiers are not confusable');
await png('00-bay-refuses-in-words.png');

// ══════════════════════════ STEP 1 — a capsule offers NO repair, and says why (the closed defect)
log('\nSTEP 1 — right-click a CRYO CAPSULE: no Prioritise entry, and a sentence saying why');
await escape();
await sleep(1500);

/** ⭐ Enter a room from the Overview with a real pointer click on its element — and PROVE it opened.
 *  `roomzoom-view.js:enterRoom` sets `document.body.classList.add('roomzoom-open')`, and every
 *  gesture handler on the surface returns early on `!_open`. Returning true on "I found the element
 *  and clicked it" would make every step-1 leg below measure a CLOSED surface, which is the
 *  false-green this whole file is written to refuse. */
async function enterRoom(anchor) {
  const opened = () => evaluate(`document.body.classList.contains('roomzoom-open')`);
  for (let attempt = 0; attempt < 3; attempt++) {
    await escape();
    await sleep(600);
    const b = await json(`(()=>{const e=document.querySelector('.pl-room[data-anchor=${JSON.stringify(anchor)}]');`
      + `if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if (!b) { log(`  .pl-room[data-anchor="${anchor}"] is not in the Overview DOM`); return false; }
    await clickAt(b.x, b.y);
    await sleep(3000);
    if (await opened()) return true;
    log(`  the click on "${anchor}" did not open the Room Zoom (attempt ${attempt + 1}/3)`);
  }
  return false;
}
if (!await enterRoom('cryobay')) die(8, 'the cryo bay is not on the Overview — cannot reach a capsule');

/** Await a page-side async expression and parse its JSON. ⚠️ THE `JSON.stringify` MUST HAPPEN
 *  INSIDE the page's own await: stringifying a Promise yields `{}`, which reads as "the surface
 *  returned an empty object". The first draft of this tool printed exactly that and it cost a run. */
const jsonAsync = async (expr) => {
  const out = await evaluate(`(async()=>JSON.stringify(await (${expr})))()`);
  return (out && out !== 'null') ? JSON.parse(out) : null;
};

// ⭐⭐ THE ROOM RECT IS THE SURFACE'S OWN DERIVATION, ASKED IN THE PAGE — not the raw `decks` tuple.
// ⛔ THE RAW TUPLE IS THE WRONG SPACE, MEASURED: `roomzoom-view.enterRoom` takes its `_focus` from
// `roomTileRect(decksView(decodeDecks(...), decodeRooms(...)), anchor)`, and `decksView` maps each
// slot through `deckSlotView`, which is where the tile RECT is produced. The first draft of this
// tool read `[slotIndex, x, y, w, h, …]` straight off the socket, got `{rx:0,ry:0,rw:12,rh:8}`, and
// every aimed point fell OUTSIDE the room — `tileFromCanvasXY` answered `null` seven times running.
// Asking the page's own modules is what makes the aim and the handler share one derivation, which
// is the same single-authority rule this whole package is about, applied to a test tool.
const focusRect = () => jsonAsync(`(async()=>{
  const [RM, DM, WM, Hud] = await Promise.all([
    import('/src/ui/room-model.js'), import('/src/ui/decks-model.js'),
    import('/src/wire/messages.js'), import('/src/ui/hud.js')]);
  return RM.roomTileRect(DM.decksView(WM.decodeDecks(Hud.getDecks()), WM.decodeRooms(Hud.getRooms())),
                         'cryobay');
})()`);

const rect = await focusRect();
if (!rect) die(9, 'the surface\'s own `roomTileRect` cannot resolve `cryobay` — step 1 cannot aim');
log('  cryo bay rect (the surface\'s own):', JSON.stringify(rect));

// ⭐⭐ THE TILE→SCREEN MAP IS THE SURFACE'S OWN, INVERTED IN THE PAGE — not a second copy here.
// `onCanvasContext` resolves a point with `tileFromCanvasXY(x, y, #rz-layers.getBoundingClientRect(),
// _focus)`, which letterboxes through `roomFit(focus, w, h, U)`. A tool that re-derived that from the
// SVG's `viewBox` would be a SECOND authority on the mapping — and the first draft of this file was
// exactly that, and missed every tile.
const screenOf = (tx, ty) => jsonAsync(`(async()=>{
  const RM = await import('/src/ui/room-model.js');
  const l = document.getElementById('rz-layers'); if (!l) return null;
  const r = l.getBoundingClientRect();
  const f = RM.roomFit(${JSON.stringify(rect)}, r.width, r.height);
  return { x: r.left + f.offX + ((${tx} - ${rect.rx}) + 0.5) * f.unit * f.s,
           y: r.top  + f.offY + ((${ty} - ${rect.ry}) + 0.5) * f.unit * f.s };
})()`);

/** ⭐ THE SURFACE'S OWN ANSWER for the tile a screen point lands on, asked through the module the
 *  handler itself calls. It separates "the gesture did not fire" from "the gesture fired on the
 *  wrong tile" — two failures that look identical from the menu's hidden bit. */
const tileUnder = (p) => jsonAsync(`(async()=>{
  const RM = await import('/src/ui/room-model.js');
  const l = document.getElementById('rz-layers'); if (!l) return null;
  const r = l.getBoundingClientRect();
  return RM.tileFromCanvasXY(${p.x}, ${p.y}, {left:r.left,top:r.top,width:r.width,height:r.height},
    ${JSON.stringify(rect)});
})()`);

/** The room a deck-0 tile belongs to, by the SAME derivation — or null. */
const roomOf = (tx, ty) => jsonAsync(`(async()=>{
  const [DM, WM, Hud] = await Promise.all([
    import('/src/ui/decks-model.js'), import('/src/wire/messages.js'), import('/src/ui/hud.js')]);
  const view = DM.decksView(WM.decodeDecks(Hud.getDecks()), WM.decodeRooms(Hud.getRooms()));
  for (const d of view) {
    if ((d.deck | 0) !== 0) continue;
    for (const s of d.slots || []) {
      const r = s.rect || {};
      if (${tx} >= (r.x|0) && ${tx} < (r.x|0)+(r.w|0) && ${ty} >= (r.y|0) && ${ty} < (r.y|0)+(r.h|0))
        return s.anchorName;
    }
  }
  return null;
})()`);

// ⛔ THE GESTURE. A DISPATCHED `contextmenu`, because CDP's right button does not raise one in
// headless Chrome (measured by M3-4) — and this step's expected result is "no menu", so a gesture
// that never fires would PASS for the wrong reason. It reaches `onCanvasContext` through the real
// bubble-phase listener on `#rz-canvas`, which is the same path a player's own right-click takes.
const rightClick = async (tx, ty) => {
  const p = await screenOf(tx, ty);
  if (!p) return null;
  await evaluate(`(()=>{const c=document.getElementById('rz-canvas');if(!c)return 'no-canvas';`
    + `c.dispatchEvent(new MouseEvent('contextmenu',{clientX:${p.x},clientY:${p.y},`
    + `button:2,buttons:2,bubbles:true,cancelable:true}));`
    + `return 'sent';})()`);
  return p;
};
const menuOpen = () => evaluate(`(()=>{const m=document.getElementById('rz-ctx');return !!m && !m.hidden;})()`);
const toastNow = () => evaluate(`document.getElementById('rz-toast')?.textContent || ''`);
// ⛔ NOT ESCAPE. `roomzoom-view.js`'s ESC stack has FOUR rungs and the last one is `exitRoom` — so
// pressing ESC to dismiss the menu LEAVES THE ROOM, and every gesture after the first then aims at
// a closed surface whose `#rz-layers` has no box. Measured: seven probes in a row resolved to
// `null`, the control refused to pass, and the tool reported "the gesture never reached the
// surface" — which was TRUE, and true for a reason inside the tool. The surface's own dismissal for
// this menu is a LEFT CLICK on the floor (`prioritise-menu.test.js`: "a LEFT click on the floor
// dismisses an open menu"), which is also what a player does.
const closeMenu = async () => {
  const p = await screenOf(rect.rx, rect.ry);
  if (p) await clickAt(p.x, p.y);
  await sleep(250);
};

// The capsules and a SERVICEABLE machine, both in this room, both off the independent socket.
const inRect = (c) => (c[2] | 0) === rect.deck
  && c[0] >= rect.rx && c[0] < rect.rx + rect.rw && c[1] >= rect.ry && c[1] < rect.ry + rect.rh;
const pods = devicesOf(rect.deck).filter((c) => inRect(c) && (c[3] | 0) === KIND_CRYOPOD);
const serviceable = devicesOf(rect.deck).filter((c) => inRect(c) && (c[3] | 0) !== KIND_CRYOPOD && (c[7] | 0) === 1);
log('  in this room: ' + pods.length + ' capsules, ' + serviceable.length + ' serviceable machines');
check(pods.length > 0, 'the cryo bay really carries capsules on the wire');
check(pods.every((c) => (c[7] | 0) === 0),
  '⭐ every capsule row carries serv = 0 — the sim\'s own `maint` opt-out reaching the client');

// (a) THE CONTROL FIRST, so a "no menu" result below is never mistaken for a dead gesture.
log('  roomzoom-open =', await evaluate(`document.body.classList.contains('roomzoom-open')`),
    '· #rz-ctx present =', await evaluate(`!!document.getElementById('rz-ctx')`));
let control = null;
for (const m of serviceable) {
  await closeMenu();
  const p = await rightClick(m[0], m[1]);
  await sleep(500);
  const open = await menuOpen();
  log(`    (${m[0]},${m[1]}) kind ${m[3]} → the surface resolves that point to `
    + JSON.stringify(p && await tileUnder(p)) + ` · menu ${open ? 'OPENED' : 'stayed shut'}`);
  if (open) { control = m; break; }
}
check(!!control, '⛔ CONTROL: the same gesture OPENS the menu on a serviceable machine '
  + (control ? `at (${control[0]},${control[1]})` : '(NONE FOUND — step 1 below proves NOTHING: a '
  + 'gesture that never reaches the surface produces the expected result for the wrong reason)'));
if (control) await png('01a-menu-on-a-serviceable-machine.png');
await closeMenu();

// (b) THE CAPSULE.
if (!control) { log('  skipping the capsule leg: without the control it is not evidence'); }
else {
  const pod = pods[0];
  await evaluate(`(()=>{const t=document.getElementById('rz-toast');if(t)t.textContent='';return 1;})()`);
  await rightClick(pod[0], pod[1]);
  await sleep(600);
  const open = await menuOpen();
  const said = await toastNow();
  log(`  capsule at (${pod[0]},${pod[1]}): menu open = ${open} · toast = ${JSON.stringify(said)}`);
  check(open === false,
    '⭐ NO Prioritise entry on a capsule. `CryoPod` is maint = 0.00, so the sim refuses every order '
    + 'at one: the menu was promising a repair that could never happen, the click fired a toast, and '
    + 'NOTHING reached any surface.');
  check(/NEVER SERVICED/.test(said || ''),
    '…and the refusal SPEAKS. RimWorld §2.2: the menu states the reason at the point of the click. '
    + 'Silence is reserved for bare floor, which is not a target the player aimed at.');
  check(/CRYO POD/.test(said || ''), '…and NAMES the machine, from the wire\'s own kind byte');
  await png('01b-capsule-refuses.png');
}

// ══════════════════════ STEP 2 — the badge NAMES THE ITEM (the protocol change, on a player's eyes)
log('\nSTEP 2 — a repair order the ship cannot pay for: the badge names the ITEM');
await escape();
await sleep(1200);

// ⛔ REACHED BY PLAYING. Switch REPAIR on in the WORK tab and let the maintenance board spend and
// carry the wreck's stock down — the behaviour M3-4 filed and measured twice ("6 of the wreck's 10
// Seals + its only Parts in ~10 sim-h, and the pawn CARRIES the rest").
//
// ⭐⭐ **THE WAIT BUDGET WAS RE-MEASURED, 2026-08-04, AND THE ANSWER IS THAT NO BUDGET REACHES THE
// STATE FROM THE OPENING POSITION.** The paragraph that stood here was D7's flagged PREDICTION —
// "roughly seven more services (~2 more sim-hours) stand between boot and nothing loose … the fix
// is the wait budget". It is FALSE, and it is replaced by numbers a run produced:
//   1. ⛔ **THE UNORDERED DRAIN HAS A FLOOR OF FOUR LOOSE UNITS.** Driven on a fresh shipping wreck
//      with REPAIR on and the clock at max: 18 loose units (8 Parts + 10 Seals) fall to **exactly
//      4** inside ~10 s of wall clock, and then NOTHING moves for the next 290 s. That floor is
//      `MaintenanceSystem.AutonomousRepairReserve = 4` (D3), applied in the first line of
//      `FindNearestConsumable` when `forced` is false.
//   2. ⛔⛔ **BUT THE RESERVE IS NOT THE WALL, AND SAYING IT WAS IS THE MISTAKE THIS PARAGRAPH USED
//      TO MAKE.** A DIRECT ORDER SPENDS THE RESERVE BY DESIGN: `DriveWorker` takes
//      `forced = worker.HeldByOrder` (`MachineWearSystem.cs:317`) straight to the funnel's skip
//      (`:871`), so an ordered service sees the whole pile. MEASURED on a post-drain host: one
//      ordered repair took loose **4 → 3**. "4 ≠ 0, forever" was wrong and is withdrawn.
//   3. ⭐ **WHAT ACTUALLY STOPS THE SHIP IS A CONJUNCTION, AND ITS THIRD LEG IS THE GEOMETRY.** By
//      the time the drain floors, the candidate list has already fallen 22 → 12: every REACHABLE
//      wrecked machine has been serviced. Ordering each of the 12 survivors one at a time and
//      reading its own `blocked` answer: **1 accepted (and its service spent a reserved unit,
//      4 → 3), 11 `ReasonNoRoute`** — the pressure frontier. With that last one repaired there is
//      no reachable sink left, and loose held at 3 for a further 120 s.
//   4. ⇒ SO IT IS AN OPENING-STATE FACT, NOT A PERMANENT ONE. As the player opens the frontier the
//      `no_route` machines become orderable, ordered repairs spend the last units, and the
//      NO-CONSUMABLE badge becomes due. ⛔ NOTHING HERE IS AN ARGUMENT FOR MOVING THE D3 RESERVE:
//      that is an owner decision, and moving it would not deliver this badge — leg 3 would still
//      hold every remaining machine behind the frontier.
//   5. ⛔ **AND THIS STEP'S OWN SWEEP USED TO FREEZE THE DRAIN COMPLETELY.** Re-issuing a
//      `prioritise` at 22 machines every 120 ms PRE-EMPTS the one pawn before any 15-sim-minute
//      service can finish. Measured as a pair on identical fresh hosts: sweeping continuously, the
//      larder sat at 7 Parts + 10 Seals for 180 s and moved by ZERO; with a 5 s gap between passes
//      it reached the floor of 4 in ~10 s. The old loop was outrunning the thing it was waiting for.
//   6. So the shape below is DRAIN FIRST, UNSWEPT, THEN SWEEP — the drain phase is bounded at
//      `DRAIN_BUDGET_S` (90 s, ~9× the measured ~10 s) and exits early on a stall, and only then do
//      the orders go out, with a gap. D7's seven crates are NOT the cause of the miss: they change
//      how many units fall in those first seconds and nothing else.
// ⇒ THE OBSERVE LINE THEREFORE REPORTS THE FLOOR IT HIT **AND CENSUSES THE `no_route` ROWS**, so
//   the conjunction's third leg is MEASURED on every run rather than quoted from this comment.
//   Filed in MECHANICS §13.33.
// Carried and reserved stacks are invisible to `FindNearest`, which is exactly what makes the order
// unpayable while matter is still aboard.
// ⚠️ NOT "AT BOOT" — steps 0 and 1 have already run, and step 0b's direct order at `term_moss` has
// already eaten a unit. The true boot census is 18 (8 Parts + 10 Seals, read on a socket opened
// against a fresh host); this line is what is left when step 2 begins, and mislabelling it as the
// boot figure is how a reader concludes the ship authors 17.
log('  loose repair consumables when STEP 2 begins (boot is 18; step 0b has already spent):',
  looseConsumables());
const workTab = await centre('[data-ov-tab="work"]');
if (workTab) { await clickAt(workTab.x, workTab.y); await sleep(1500); }
// The grid's cells carry `data-ov-work-cid` / `data-ov-work-type` (overview-view.js:onWorkCellClick),
// and Repair is WorkType 0 — the sim's own enum order. A real pointer click on the real cell.
const repairCell = await centre(`[data-ov-work-cid="${cid}"][data-ov-work-type="0"]`);
if (repairCell) {
  // The grid CYCLES (OFF ▸ 1 ▸ 2 ▸ 3 ▸ 4 ▸ OFF), so one click is enough to leave OFF.
  await clickAt(repairCell.x, repairCell.y); await sleep(800);
  log('  REPAIR switched on by a real click in the WORK tab');
} else {
  // Disclosed fallback: the same wire message that click lowers to (`Cmd.workPriority`). It is the
  // COMMAND, not a sim write — the sim still validates it at the tick boundary.
  log('  (no WORK cell matched the selector — sending the `workPriority` the click lowers to)');
  ws.send(JSON.stringify({ cmd: 'workPriority', cid, work: 0, priority: 3 }));
}
await escape();
// ⛔ THE CLOCK IS VERIFIED, NOT SENT. `[data-ov-speed-up]` lives on the OVERVIEW toolbar, so a
// click made while another tab or the Room Zoom owns the screen lands on nothing and the game
// quietly stays at 1× — and a wait budget measured in sim-hours is worth nothing at 1×.
// `heater-shot.mjs` learned this the expensive way (its whole heating phase ran at 1× and it
// reported a dead heater). Re-read the button EVERY time, and fall back to the wire command the
// button lowers to (`Cmd.speed(+1)`, session.js:60) rather than carrying on at an unknown speed.
for (let i = 0; i < 3; i++) {
  const b = await centre('[data-ov-speed-up]');
  if (b && b.w && b.h) { await clickAt(b.x, b.y); } else { ws.send(JSON.stringify({ cmd: 'speed', delta: 1 })); }
  await sleep(250);
}
log('  speed reads:', JSON.stringify(await evaluate(
  `(()=>{const e=document.querySelector('.ov-speedval');return e?e.textContent:'(none)';})()`)));

// ⚠️ THE CENSUS BELOW IS CONSERVATIVE, AND SAYING SO IS THE POINT. `GameSession.BuildItems` skips
// CARRIED stacks but keeps RESERVED ones, while `MachineWearSystem.FindNearest` refuses both — so
// against WHAT A REPAIR COULD REACH it is an OVER-count, and it therefore reaches zero LATER than
// the sim's own answer does, never earlier: when it says 0 the order is certainly unpayable.
// ⛔ BUT AGAINST WHAT THE SHIP IS HOLDING IT READS *UNDER*, AND THE TRANSIENT IS WHERE THAT BITES —
// a stack in a pawn's hands has left the channel entirely. Measured on the drain below: the run
// dips to 2 for one poll while two units are carried, then settles back to 4 when they are set
// down. ⇒ NO SINGLE READING ESTABLISHES THE FLOOR. What establishes it is the STALL DETECTOR —
// five consecutive identical polls — which is why the loop watches for one instead of trusting the
// smallest number it saw. It is a progress log; THE VERDICT IS THE ROW ITSELF.
//
// ⭐ AND THE ORDER IS RE-ISSUED ON EVERY POLL, which is what a player does and what the channel
// requires: `BuildBlocked`'s retire rule drops an order the sim can currently service, so an order
// given while a Seals stack is still loose is gone by the next render.
const WRECK_BYTE = 0.25 * 255;
// ⛔ A SWEEP, NOT ONE TARGET, AND THE REASON IS A REFUSAL THIS PACKAGE DOES NOT OWN. An order at a
// machine with NO WALKABLE NEIGHBOUR is refused outright by `PrioritiseJobCommand`
// (`TryFindStagingTile` — an order crosses the air, never the geometry), so it never enters
// `_prioritised` and never raises a row of ANY kind. Measured on the first run of this tool: the
// wreck's (8,9,0) is one such machine, and a single-target rig read that as "the badge never
// appeared". Sweeping every wrecked serviceable machine on deck 0 is what a player does, and it
// separates "this package's row is missing" from "that particular machine is walled in".
const candidates = devicesOf(0)
  .filter((c) => (c[4] | 0) < WRECK_BYTE && (c[7] | 0) === 1
    && !(c[0] === MOSS_XY[0] && c[1] === MOSS_XY[1]));
if (!candidates.length) die(10, 'no wrecked serviceable machine on deck 0 to order a repair on');
log('  ' + candidates.length + ' wrecked serviceable machines on deck 0 to try');

const rowFor = (c) => blockedRows().find((r) => r[0] === c[0] && r[1] === c[1]
  && (r[2] | 0) === 0 && (r[3] | 0) === ORDER_REPAIR && (r[4] | 0) === REASON_NO_CONSUMABLE);

// ── (i) THE DRAIN PHASE, UNSWEPT. No orders go out while this runs: measurement 2 in the block
// above says the sweep's own re-issue pre-empts the pawn before any service can finish, so the
// orders are what USED to stop the drain. Bounded at DRAIN_BUDGET_S and exits early on a stall,
// because the measured drain takes ~10 s and then never moves again.
const DRAIN_BUDGET_S = 90;
const drainT0 = Date.now();
let looseStart = looseConsumables(), stalledFor = 0, looseNow = looseStart;
while ((Date.now() - drainT0) / 1000 < DRAIN_BUDGET_S && looseNow > 0) {
  await sleep(5000);
  const n = looseConsumables();
  stalledFor = (n === looseNow) ? stalledFor + 5 : 0;
  looseNow = n;
  log(`    drain t+${Math.round((Date.now() - drainT0) / 1000)}s  loose(ground stacks; carried units are invisible here) = ${looseNow}`);
  if (stalledFor >= 25) break;   // five identical polls: the larder has found its floor
}
log(`  the larder went ${looseStart} -> ${looseNow} loose units and then held for ${stalledFor}s`);

// ── (ii) THE SWEEP. ⭐ THE ORDER IS RE-ISSUED ON EVERY PASS, which is what a player does and what
// the channel requires: `BuildBlocked`'s retire rule drops an order the sim can currently service,
// so an order given while a Seals stack is still loose is gone by the next render. ⛔ WITH A GAP
// BETWEEN PASSES, measured: back-to-back passes pre-empt the one pawn continuously and the ship
// stops spending altogether.
// ⭐⭐ THE REASON CENSUS IS A UNION OVER THE WHOLE SWEEP, AND ATTRIBUTION COMES FROM THE ROW'S OWN
// COORDINATES — never from "the candidate we just ordered". ⛔ MEASURED, because the first cut of
// this census got it wrong and printed 1 where the truth is 11: the `blocked` channel carries rows
// only for orders that are PENDING, and one pawn holds one order, so a point-in-time read at the
// end of a sweep sees exactly the LAST machine ordered. Worse, at a 120 ms dwell against a 10 Hz
// sim the row visible after ordering candidate N is as likely to be candidate N−1's — so pairing
// our loop position with whatever row happens to be up would MIS-ATTRIBUTE a reason to a machine.
// Unioning by `r[0],r[1]` is lag-immune: a row seen at a candidate's tile is that tile's own answer,
// whenever it arrived.
const seenReason = new Map();
const noteRows = () => { for (const r of blockedRows()) seenReason.set(`${r[0]},${r[1]}`, r[4] | 0); };
let row = null, target = null;
for (let pass = 0; pass < 6 && !row; pass++) {
  for (const c of candidates) {
    ws.send(JSON.stringify({ cmd: 'prioritise', cid, x: c[0], y: c[1], deck: 0 }));
    await sleep(120);
    noteRows();
    const r = rowFor(c);
    if (r) { row = r; target = c; break; }
  }
  if (!row) await sleep(5000);   // let a pre-empted service actually finish before re-ordering
  noteRows();
  log('    …', pass + 1, 'passes, loose(ground stacks) =', looseConsumables(),
    '· blocked rows now =', blockedRows().length, '· candidates that have answered =', seenReason.size);
}
// ⚠️⚠️ AN OBSERVATION AND NOT A CHECK, AND THE REASON IS WHICH CLAIM IT CARRIES.
// THAT THE HOST EMITS THE DETAILED ROW is proven on a real session over the shipping wreck by
// `PrioritiseOrderTests.TheNoConsumableRow_NamesTheItemTheOrderIsWaitingFor` — green in the gate,
// RED under the charter's mutation 3. This leg's only extra content is *"…and a player can get
// there by playing, in about this long"*, which is a PACING fact about the ship, not a fact about
// the package. Failing the run on it would let a content wobble redden a correct implementation.
// MEASURED on the shipping wreck (2026-08-04, REPAIR on, clock at max, drain-then-sweep): the
// larder falls from 18 loose consumable units to EXACTLY 4 in ~10 s and then holds; a DIRECT order
// spends past that (4 → 3, one ordered repair), and what stops the ship is that the survivors are
// behind the pressure frontier — 11 of 12 answer `no_route`. That is a real observation about the
// wreck's OPENING pacing and it is FILED in MECHANICS §13.33, not fixed here. (2026-08-01,
// pre-D3-reserve and pre-D7-crates, the same leg read 10 → 2 and stopped.)
//
// ⭐ THE `no_route` CENSUS IS TAKEN FROM THE ROWS THIS RUN ACTUALLY RECEIVED, so the conjunction's
// third leg is a number from THIS ship rather than a sentence quoted out of the block above. It is
// counted over the candidates the sweep ordered, which is exactly the set the claim is about.
const REASON_NO_ROUTE = 5;
const answered = candidates.filter((c) => seenReason.has(`${c[0]},${c[1]}`));
const noRouteSeen = answered.filter((c) => seenReason.get(`${c[0]},${c[1]}`) === REASON_NO_ROUTE).length;
log(`  reason census over the sweep: ${answered.length} of ${candidates.length} candidates raised a `
  + `row, ${noRouteSeen} of them NO WAY TO WALK TO IT`);
const drained = observe(!!row,
  drained_msg(row, target, candidates.length));
function drained_msg(r, t, n) {
  return r
    ? `the ship PLAYED its way to a repair order it cannot pay for, at (${t[0]},${t[1]},0) `
      + '— nothing was removed by this tool'
    : `no NO-CONSUMABLE row on any of the ${n} candidates. THE LARDER drained ${looseStart} -> `
      + `${looseNow} loose units and held there, and ${noRouteSeen} of the ${answered.length} `
      + 'candidates that answered at all said NO WAY TO WALK TO IT. ⛔ THAT CONJUNCTION IS THE '
      + 'REASON, NOT THE D3 RESERVE ON '
      + 'ITS OWN: a direct order DOES spend the reserve (`DriveWorker`\'s `forced` = '
      + '`worker.HeldByOrder`, measured 4 -> 3), so what is missing is a REACHABLE machine to spend '
      + 'it on — the survivors are behind the pressure frontier, and this is an OPENING-STATE fact '
      + 'that the player dissolves by opening the ship. THE EMISSION IS NOT IN DOUBT — it is owned '
      + 'by `PrioritiseOrderTests.TheNoConsumableRow_NamesTheItemTheOrderIsWaitingFor`, which '
      + 'drives a real session and reddens under the ladder mutation. What this line reports is '
      + 'PACING. Filed in MECHANICS §13.33.';
}

if (drained) {
  log('  blocked row:', JSON.stringify(row));
  check(row.length === 6, '⭐ the tuple carries SIX elements — the protocol change, on the wire');
  check((row[5] | 0) !== DETAIL_NONE && (row[5] | 0) === ITEM_PARTS,
    '⭐ …and the sixth NAMES THE ITEM (' + row[5] + ' = Parts, the top of the sim\'s own repair '
    + 'ladder). Sent as `MaintenanceSystem.WantedRepairConsumable`, never as a host-side literal.');
}

// ══════════════════════════════ STEP 2b — THE SENTENCE ON THE PLAYER'S SCREEN
//
// ⚠️⚠️ THE ROW IS INJECTED THROUGH THE CLIENT'S OWN DISPATCH, AND THE HOST IS NOT MODIFIED — this
// is `blocked-shot.mjs`'s documented technique, reused rather than reinvented ("the `case 'blocked'`
// path with a synthetic payload; THE HOST IS NOT MODIFIED"). It exists because the two halves of
// step 2 are different claims and only one of them needs a browser:
//
//   · THAT THE HOST EMITS THE DETAILED ROW is proven, on a real session over the shipping wreck, by
//     `PrioritiseOrderTests.TheNoConsumableRow_NamesTheItemTheOrderIsWaitingFor` — green in the
//     gate, and RED under the charter's mutation 3 (the sim's ladder reordered). A browser adds
//     nothing to it. Step 2a above ALSO tries to reach it by playing, and reports honestly.
//   · THAT THE SENTENCE REACHES A PLAYER'S EYES — in the real stylesheet, in the visible key box
//     rather than only in a `<title>` — can be proven by NOTHING BUT A BROWSER. That is this step.
//
// ⛔ SO THIS STEP CLAIMS THE RENDER AND NOT THE EMISSION, and it says so in its own PASS lines. A
// harness that blurred the two would be claiming a browser had verified a host.
log('\nSTEP 2b — the sentence on the SCREEN (row injected through the client\'s own dispatch)');
// A machine whose room this client can actually open — asked through the surface's own derivation.
let shown = null, home2 = null;
for (const c of candidates) {
  const r = await roomOf(c[0], c[1]);
  if (r) { shown = c; home2 = r; break; }
}
if (!shown) die(11, 'no wrecked machine on deck 0 sits in a room the Room Zoom can open');
log(`  drawing a NO-CONSUMABLE row at (${shown[0]},${shown[1]},0) in room ${home2}`);
if (!home2 || !await enterRoom(home2)) {
  check(false, 'could not enter the machine\'s room — the on-screen half of step 2 was not run');
} else {
  const inject = async (cells) => evaluate(`(async()=>{const H=await import('/src/ui/hud.js');`
    + `H.renderBlocked({type:'blocked',cells:${JSON.stringify(cells)}});return true;})()`);
  const keyBox = () => evaluate(`document.getElementById('rz-zonekey')?.textContent || ''`);

  // (a) THE OLD SHAPE — a FIVE-element row, exactly what a pre-M3-13 host emits. This is the
  //     BEFORE picture, taken in the same run so the difference is measured rather than remembered.
  await inject([[shown[0], shown[1], 0, ORDER_REPAIR, REASON_NO_CONSUMABLE]]);
  await sleep(1500);
  const before = await keyBox();
  log('  key box (5-element row):', JSON.stringify(before.slice(0, 240)));
  check(/NO PARTS OR SEALS ABOARD/.test(before),
    'premise: a pre-M3-13 row still draws, and still reads the generic sentence (the append-only '
    + 'contract — a short row must never be dropped)');

  // (b) THE NEW SHAPE — the same row with `detail = ItemKind.Parts`.
  await inject([[shown[0], shown[1], 0, ORDER_REPAIR, REASON_NO_CONSUMABLE, ITEM_PARTS]]);
  await sleep(1500);
  const after = await keyBox();
  const titles = await json(`[...document.querySelectorAll('.rz-blocked title')].map((e)=>e.textContent)`) || [];
  log('  key box (6-element row):', JSON.stringify(after.slice(0, 240)));
  log('  <title>:', JSON.stringify(titles.slice(0, 2)));
  check(/NEEDS PARTS/.test(after),
    '⭐⭐ THE STEP THAT PROVES THE PROTOCOL CHANGE REACHES THE PLAYER: the VISIBLE key box names the '
    + 'ITEM. Before M3-13 this read the generic "NO PARTS OR SEALS ABOARD" — a sentence the thaw '
    + 'ladder\'s ControllerModule rungs made visibly wrong, and one that sends the player to make '
    + 'the wrong thing. (The key box, not the <title>: a hover nobody knows to try and that does '
    + 'not exist on a touch device is the same silence one layer down.)');
  check(after !== before, 'the sixth element CHANGED what is on screen — measured against (a), in '
    + 'this same run, rather than against a remembered baseline');
  check(!/NO PARTS OR SEALS ABOARD/.test(after), 'and the generic sentence is not printed beside it');
  check(titles.some((t) => /NEEDS PARTS/.test(t)),
    'the <title> composes from the SAME sentence — one wording per row, not two');
  check(!/undefined|NaN/.test(after + ' ' + titles.join(' ')), 'nothing rendered as `undefined`');
  await png('02-badge-names-the-item.png');

  // (c) THE DEGRADE PATH, on screen: an ItemKind this client cannot name falls back rather than
  //     printing `undefined` — the charter's mutation 2, seen rather than asserted.
  await inject([[shown[0], shown[1], 0, ORDER_REPAIR, REASON_NO_CONSUMABLE, 8]]);   // Ice
  await sleep(1200);
  const degraded = await keyBox();
  log('  key box (unnameable detail):', JSON.stringify(degraded.slice(0, 240)));
  check(/NO PARTS OR SEALS ABOARD/.test(degraded) && !/undefined/.test(degraded),
    'an unnameable ItemKind degrades to the generic sentence ON SCREEN, never to `undefined`');
  await inject([]);   // leave the surface as we found it
}

log(failures ? `\n${failures} CHECK(S) FAILED` : '\nOK — every check passed.');
cdp.close();
chrome.kill('SIGKILL');
process.exit(failures ? 1 : 0);
