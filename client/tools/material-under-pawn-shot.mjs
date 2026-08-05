#!/usr/bin/env node
// material-under-pawn-shot.mjs — WALK A REAL CREW MEMBER ONTO A CARPETED TILE AND PHOTOGRAPH IT.
//
// ⚠️ WHY THIS EXISTS. The owner reported: *"when building e.g. a mat or carpet, as soon as the pawn
// stands on the corresponding square, the carpet disappears until the pawn is out of the square."*
// `room-model.test.js` now drives that defect at the seam, but a driven test plants a glyph byte in
// a fixture — it cannot say that a REAL pawn, walked by the REAL sim through the REAL order path,
// leaves the floor material on screen. The standing rules here are that invisible feedback is broken
// feedback and that the owner judges the picture, so the fix gets a picture. Sibling of
// `pawn-occlusion-shot.mjs`, which did the same job for the capsule defect.
//
// ⚠️ ONE THING IS INJECTED, AND IT IS SAID OUT LOUD RATHER THAN HIDDEN — the same admission
// `paper-materials-shot.mjs` makes for the same reason. `--ship wreck` authors NO materials:
// `GameSession.BuildMaterials` emits one row per tile whose `level.Material` byte is non-default and
// nothing in `content/core/` sets one, so the sparse `materials` channel is EMPTY on a fresh ship.
// Reaching a carpeted tile by PLAYING would need a floor designation plus a pawn to build it, and
// OD-H boots every work type off. So the rig injects a `materials` frame on the real wire, into the
// real client, through the real `renderMaterials` → `decodeMaterials` → `roomMaterialTiles` →
// `materialLayerSvg` path — the only synthetic thing is the BYTE a palette click would have put
// there. THE PAWN IS NOT FAKED: she is selected and ordered with the two messages the Room Zoom's
// MOVE tool sends, and the rig waits for `Glyphs.Citizen` (64) to appear on the target tile on the
// wire before it photographs anything.
//
// ⛔ THE MEASUREMENT IS A SET DIFFERENCE, NOT A COUNT, and that is deliberate. Each drawn floor
// material is one `<g transform=…>` inside `.rz-floor-mat`, one per tile. With the pawn at A the
// broken build is missing A's transform; with her at B it is missing B's — SAME COUNT, different
// set. A rig that compared counts would have called the defect fixed. So the rig compares the SETS
// and requires them identical, and it prints both one-sided differences.
//
// ⛔ AND THE RIG CARRIES ITS OWN NEGATIVE CONTROL: `--expect-broken` inverts the verdict, so the
// same tool run against a tree with the citizen arm removed must FAIL to be believed. A rig that has
// never been shown going red is a rig that cannot go red.
//
// ⚠️ PROCESS HYGIENE (TRAPS #5 + its addendum). Host, static server and Chrome are spawned by this
// rig, `detached: true` (own process group), and killed as `-pid`. No `pkill -f` — a broad pattern
// kill takes a sibling agent's gate with it, and a leaked headless Chrome has OOM-killed somebody
// else's `dotnet test` as a bare exit 137. `dotnet run` is a LAUNCHER whose grandchild holds the
// socket, which is why the group form is the only one that works. A port that answers before our own
// host could have built is somebody else's and is reported, never used.
//
// USAGE
//   node client/tools/material-under-pawn-shot.mjs --out client/tools/shots-material-pawn
//     [--host-port 8480] [--client-port 8481] [--cdp-port 9480] [--tag fixed] [--expect-broken]

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const HOST_PORT = +arg('host-port', '8480');
const CLIENT_PORT = +arg('client-port', '8481');
const CDP_PORT = +arg('cdp-port', '9480');
const TAG = arg('tag', 'fixed');
const EXPECT_BROKEN = has('expect-broken');
const OUT = resolve(arg('out', 'client/tools/shots-material-pawn'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOTNET = process.env.DOTNET || join(process.env.HOME, '.dotnet', 'dotnet');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

const OWNED = [];
function reap() {
  for (const p of OWNED) {
    try { process.kill(-p.pid, 'SIGKILL'); } catch { /* group gone */ }
    try { p.kill('SIGKILL'); } catch { /* gone */ }
  }
}
function die(code, why) { console.error('FAIL: ' + why); reap(); process.exit(code); }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { reap(); process.exit(130); });

// ───────────────────────────────────────────── 1. host + static server, ours and only ours
try {
  const stale = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  await new Promise((res, rej) => { stale.onopen = res; stale.onerror = rej; });
  stale.close();
  die(1, `something is ALREADY listening on ${HOST_PORT} — this rig will not photograph a host it did `
    + 'not start. Pick another --host-port, or kill that process by pid.');
} catch { /* nothing there: good */ }

const host = spawn(DOTNET, ['run', '--project', 'hosts/web', '--', '--port', String(HOST_PORT),
  '--ship', 'wreck'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
OWNED.push(host);
const serve = spawn('python3', ['client/serve.py', String(CLIENT_PORT)],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
OWNED.push(serve);
log('host pid', host.pid, '· client pid', serve.pid, '(kill THESE pids, never a pattern)');

let up = false;
for (let i = 0; i < 150 && !up; i += 1) {
  await sleep(1000);
  try {
    const w = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
    await new Promise((res, rej) => { w.onopen = res; w.onerror = rej; });
    w.close(); up = true;
  } catch { /* still building */ }
}
if (!up) die(2, `no host answering on ${HOST_PORT} after 150 s`);
log('host up on', HOST_PORT);

// ───────────────────────────────────────────── 2. the control socket that drives the pawn
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('control socket refused'));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
const send = (o) => ws.send(JSON.stringify(o));
// A SETTLE WAIT, not cosmetic: a rig that photographs the first frame it is handed photographs a
// partially-populated projection (`wreck-shot.mjs` read 10 of 12 pods against an 8 s-old host).
await sleep(4000);

const cellAt = (f, x, y) => { const c = f?.cells?.[y * f.w + x]; return Array.isArray(c) ? (c[0] | 0) : -1; };
for (let i = 0; i < 16 && (latest.get('frame')?.deck | 0) !== 0; i += 1) {
  send({ cmd: 'deck', dz: Math.sign(0 - (latest.get('frame')?.deck | 0)) });
  await sleep(450);
}
await sleep(1500);
const f0 = latest.get('frame');
if (!f0 || (f0.deck | 0) !== 0) die(3, 'could not reach deck 0');

// ⛔ THE COMPARTMENT RECTS, OFF THE WIRE — because THE CREW WANDER AND A TILE READ ONCE IS STALE.
// The first cut of this rig read the pawn's tile here, then spent ~50 s launching Chrome, injecting
// and opening rooms before clicking it; by then she had walked away (deck-confined idle wander), the
// click selected nobody, `MoveOrder` dropped the order as "no crew selected", and the rig timed out.
// So the only thing taken NOW is the geometry, which does not move; the pawn is re-found at the last
// possible moment, inside the compartment actually on screen.
const decksMsg = latest.get('decks');
const slots = [];
for (const d of (decksMsg?.decks || [])) {
  if ((d?.deck | 0) !== 0) continue;
  for (const t of (d.slots || [])) {
    if (Array.isArray(t) && t.length >= 6 && typeof t[5] === 'string')
      slots.push({ anchor: t[5], rx: t[1] | 0, ry: t[2] | 0, rw: t[3] | 0, rh: t[4] | 0 });
  }
}
if (!slots.length) die(4, 'the `decks` channel carried no deck-0 compartment rects');
log('deck-0 compartments: ' + slots.map((s) => s.anchor).join(', '));
const inRect = (s, x, y) => x >= s.rx && x < s.rx + s.rw && y >= s.ry && y < s.ry + s.rh;
/** A crew member and a plain-floor ('.') neighbour, BOTH inside `slot`, read from the LIVE frame. */
function pickPair(slot) {
  const f = latest.get('frame');
  if (!f || (f.deck | 0) !== 0) return null;
  const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];
  for (let y = slot.ry; y < slot.ry + slot.rh; y += 1) {
    for (let x = slot.rx; x < slot.rx + slot.rw; x += 1) {
      if (cellAt(f, x, y) !== 64) continue;
      for (const [dx, dy] of RING) {
        const bx = x + dx, by = y + dy;
        // B must be plain floor: then the ONLY thing that changes on it when she arrives is pass 5's
        // citizen overwrite — the exact defect, with no device or item glyph confounding it.
        if (inRect(slot, bx, by) && cellAt(f, bx, by) === 46) return { A: [x, y], B: [bx, by] };
      }
    }
  }
  return null;
}

// ───────────────────────────────────────────── 3. Chrome
const userDir = mkdtempSync(join(tmpdir(), 'matpawn-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir, '--disable-gpu',
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
OWNED.push(chrome);
log('chrome pid', chrome.pid);

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) die(5, 'Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
  if (!r.result?.data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
  return p;
}
/** A 3× clip around the crew member's own figure — the full plate is 1600 px wide and the disputed
 *  tile is a ~85 × 13 px sliver of floor between two pod rows, which is not a picture anyone can
 *  judge. `.rz-pawn` is the figure's own group, so the crop follows her instead of a fixed box. */
async function pawnClip() {
  const b = await json('(()=>{const e=document.querySelector(".rz-pawn");if(!e)return null;'
    + 'const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()');
  if (!b) return null;
  const padX = 120, padTop = 40, padBot = 90;   // her feet — and the tile under them — sit LOW in the box
  return {
    x: Math.max(0, b.x - padX), y: Math.max(0, b.y - padTop),
    width: b.w + padX * 2, height: b.h + padTop + padBot, scale: 3,
  };
}
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
};

await call('Page.enable');
await call('Runtime.enable');
// The injection shim — installed BEFORE the document runs so it wraps the session's own socket, and
// the client cannot tell an injected message from the host's (`paper-materials-shot.mjs`'s seam).
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const d = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', {
      configurable: true,
      get() { return d.get.call(this); },
      set(fn) { window.__mpSink = fn; d.set.call(this, fn); },
    });
    window.__mpInject = (o) => { window.__mpSink({ data: JSON.stringify(o) }); return true; };
  })();`,
});
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(7000);
if (!(await evaluate('typeof window.__mpInject === "function" && typeof window.__mpSink === "function"')))
  die(7, 'the injection shim never saw the session socket — the wire seam has changed shape');

// Dismiss the onboarding takeover and VERIFY it went: the first run of the sibling rig clicked
// THROUGH the card and photographed the overlay captioned as a compartment.
await evaluate("(()=>{const b=document.querySelector('.onb-begin');if(b){b.click();return 1}return 0})()");
await sleep(1200);
if (await evaluate("!!document.querySelector('.onb-card')")) die(7, 'the onboarding card would not dismiss');

// ───────────────────────────────────────────── 4. carpet every walkable tile on deck 0
// ONLY tiles whose glyph is '.' (46) or the citizen (64) get a row, so no device/item tile is
// carpeted and no '#' is handed a floor byte — the confound `paper-materials-shot.mjs` tolerates
// because it is photographing skins rather than an occlusion.
const cells = [];
for (let y = 0; y < f0.h; y += 1) for (let x = 0; x < f0.w; x += 1) {
  const g = cellAt(f0, x, y);
  if (g === 46 || g === 64) cells.push([x, y, 0, 1, 4]); // kind 1 = floor, material byte 4
}
if (cells.length < 20) die(8, `only ${cells.length} carpetable tiles on deck 0 — the frame looks wrong`);
if (!(await evaluate(`window.__mpInject(${JSON.stringify({ type: 'materials', cells })})`)))
  die(8, 'the materials injection was refused');
log(`injected ${cells.length} floor-material rows (byte 4) on deck 0`);
await sleep(1500);

// ───────────────────────────────────────────── 5. open the room the crew member is standing in
// Found by opening compartments until the cutaway DRAWS a pawn — the rig never needs the room rects.
const anchors = await json('[...document.querySelectorAll("[data-anchor]")]'
  + '.map(e=>({a:e.getAttribute("data-anchor"),r:e.getBoundingClientRect()}))'
  + '.filter(o=>o.r.width>30&&o.r.height>20).map(o=>({a:o.a,x:o.r.x+o.r.width/2,y:o.r.y+o.r.height/2}))');
if (!anchors?.length) die(9, 'the Overview offered no openable compartment');
const escKey = async () => {
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(900);
};
const roomState = () => json('(()=>{const s=document.querySelector("#roomzoom-view svg");if(!s)return null;'
  + 'return {pawns:s.querySelectorAll(".rz-pawn").length,'
  + 'mats:[...s.querySelectorAll(".rz-floor-mat > g")].map(g=>g.getAttribute("transform"))}})()');
let opened = null, slot = null;
for (const a of anchors) {
  slot = slots.find((s) => s.anchor === a.a);
  if (!slot || !pickPair(slot)) continue;   // no crew in this compartment right now
  // "Not hidden" is not "open" and one click is not a gesture that landed: re-derive the rectangle
  // and retry, because the plate repaints at the wire's 10 Hz.
  for (let t = 0; t < 3 && !opened; t += 1) {
    const now = await json('(()=>{const e=document.querySelector(`[data-anchor="' + a.a + '"]`);'
      + 'if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()');
    if (!now) break;
    await clickAt(now.x, now.y);
    await sleep(1800);
    const st = await roomState();
    if (st && st.pawns > 0 && st.mats.length > 0) opened = a.a;
  }
  if (opened) break;
  await escKey();
}
if (!opened) die(9, 'no compartment opened with BOTH a pawn and a drawn floor material — a verdict here would be vacuous');
log('opened compartment', opened, JSON.stringify(slot));

// ───────────────────────────────────────────── 6. BEFORE — she is at A
const before = await roomState();
const beforeShot = await png(`carpet-under-pawn-${TAG}-1-before.png`);
log(`  before: ${before.pawns} pawn(s), ${before.mats.length} floor-material tiles drawn`);

// ───────────────────────────────────────────── 7. walk her to B through the SHIPPING order path
// `GameSession.MoveOrder()` is `if (_selected == 0) { … return; }` — a move order with nobody
// selected is DROPPED SILENTLY, which is how the sibling rig once "passed" by accident. So the
// status line is READ BACK after each of the two messages and a wrong one is a hard failure: the
// alternative is a rig that waits 90 s for a pawn who was never ordered anywhere.
let B = null, arrived = false;
for (let attempt = 0; attempt < 4 && !arrived; attempt += 1) {
  const pair = pickPair(slot);              // re-found NOW: the crew wander between reads
  if (!pair) { await sleep(2000); continue; }
  B = pair.B;
  send({ cmd: 'click', x: pair.A[0], y: pair.A[1] });
  await sleep(800);
  const sel = latest.get('status')?.text || '';
  if (!/^selected /.test(sel)) { log(`  (attempt ${attempt + 1}: click at ${pair.A} said ${JSON.stringify(sel)} — she moved; retrying)`); continue; }
  send({ cmd: 'cursor', x: B[0], y: B[1] });
  await sleep(450);
  send({ cmd: 'move' });
  await sleep(500);
  const ord = latest.get('status')?.text || '';
  if (ord !== 'move order') { log(`  (attempt ${attempt + 1}: move said ${JSON.stringify(ord)}; retrying)`); continue; }
  log(`  ordered ${sel} from ${pair.A} to ${B}`);
  for (let i = 0; i < 120 && !arrived; i += 1) {
    await sleep(500);
    if (cellAt(latest.get('frame'), B[0], B[1]) === 64) arrived = true;
  }
}
if (!arrived) die(10, 'the crew member never reached the target tile — a photograph of an empty tile would prove nothing');
log(`the crew member is standing ON ${B} (the wire carries 64 there)`);
await sleep(1200);
if (cellAt(latest.get('frame'), B[0], B[1]) !== 64)
  die(10, `she left ${B} before the shot — the AFTER frame would not carry the defect's precondition`);

// ───────────────────────────────────────────── 8. AFTER — she is at B, on a carpeted tile
const after = await roomState();
const afterShot = await png(`carpet-under-pawn-${TAG}-2-after.png`);
const clip = await pawnClip();
const closeShot = clip ? await png(`carpet-under-pawn-${TAG}-3-closeup.png`, clip) : null;
log(`  after:  ${after.pawns} pawn(s), ${after.mats.length} floor-material tiles drawn`);

const sb = new Set(before.mats), sa = new Set(after.mats);
const lost = [...sb].filter((t) => !sa.has(t));   // drawn before, gone after → the defect
const gained = [...sa].filter((t) => !sb.has(t)); // gone before, back after → the tile she LEFT
log(`\nSET DIFFERENCE — lost ${lost.length}, gained ${gained.length}`);
if (lost.length) log('  lost:   ' + lost.join(' | '));
if (gained.length) log('  gained: ' + gained.join(' | '));

const identical = lost.length === 0 && gained.length === 0;
log('\nVERDICT: the floor-material set is ' + (identical ? 'IDENTICAL' : 'DIFFERENT')
  + ' with the pawn on a carpeted tile — ' + (identical ? 'the carpet survives her' : 'the carpet drops out'));
log('shots: ' + [beforeShot, afterShot, closeShot].filter(Boolean).join(' · '));
reap();
if (EXPECT_BROKEN) {
  // The negative control: this rig must be able to go red, or its green means nothing.
  if (identical) { console.error('FAIL: --expect-broken, but the set was identical — the rig cannot see the defect'); process.exit(11); }
  log('(--expect-broken satisfied: the rig SEES the defect)');
  process.exit(0);
}
process.exit(identical ? 0 : 12);
