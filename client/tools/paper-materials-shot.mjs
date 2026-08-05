#!/usr/bin/env node
// paper-materials-shot.mjs — THE TWELVE MATERIALS IN THE RUNNING GAME, on `--ship wreck`.
//
// ⛔ WHY A SECOND TOOL. `paper-materials-sheet.mjs` draws the skins through the shipping builders
// but over a SYNTHETIC room; it cannot say that a real compartment on the real ship, with its real
// fittings and pawns standing on it, is still readable once every wall and floor wears one of these.
// That is the only question the owner asked that a page cannot answer.
//
// ⚠️ AND ONE THING HAS TO BE FAKED, SAID OUT LOUD RATHER THAN HIDDEN. `--ship wreck` authors NO
// materials at all: `GameSession.BuildMaterials` emits one entry per tile whose material differs
// from the default, and nothing in `content/core/` sets one, so the sparse `materials` channel is
// EMPTY on a fresh ship. Every wall therefore wears byte 0 (`steel-bulkhead`) and — because
// `roomMaterialTiles` skips default floors on purpose — no floor is skinned at all. Reaching a
// mixed room by PLAYING would need a player to designate a wall and a pawn to build it, and OD-H
// boots every work type off.
//   ⇒ So the rig INJECTS a `materials` message on the real wire, into the real client, through the
//     real `Hud.renderMaterials` → `decodeMaterials` → `roomMaterialTiles` → `materialLayerSvg`
//     path. Nothing about the drawing is simulated: the only synthetic thing is the BYTE, which is
//     exactly what a player's palette click would have put there. The injection is a `WebSocket`
//     `onmessage` shim installed before the document loads, so the message arrives at the client
//     indistinguishably from the host's own.
//
// ⚠️ PROCESS HYGIENE (TRAPS #5 addendum). This rig spawns the host, the static server and Chrome
// ITSELF and kills EXACTLY the process GROUPS it recorded. No `pkill -f`: a broad pattern kill takes
// a sibling agent's gate down with it, and a leaked headless Chrome has already OOM-killed somebody
// else's `dotnet test` as a bare exit 137.
//
// ⛔ AND `kill(child.pid)` IS NOT ENOUGH HERE — MEASURED, ON THIS RIG'S OWN FIRST RUNS. `dotnet run`
// is a LAUNCHER: it builds, then execs `PeriluneWeb` as a GRANDCHILD holding the socket. Killing the
// launcher left four `PeriluneWeb` processes listening on 8390/8392/8394/8396 after four runs — and
// the second run then reported "host up on 8390" while talking to the FIRST run's leaked host, which
// is a rig photographing a process it did not start. Chrome does the same with its helper processes.
// So every child is spawned `detached: true` (its own process group) and killed as `-pid`, which is
// the only form that reaches a grandchild without matching on a name.
//
// USAGE
//   node client/tools/paper-materials-shot.mjs --out client/tools/shots-paper-materials
//     [--host-port 8390] [--client-port 8391] [--cdp-port 9390]

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const CDP_PORT = +arg('cdp-port', '9390');
const OUT = resolve(arg('out', 'client/tools/shots-paper-materials'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOTNET = process.env.DOTNET || join(process.env.HOME, '.dotnet', 'dotnet');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

/** Every process GROUP this rig started. Killed by pid and by nothing else. */
const OWNED = [];
function reap() {
  for (const p of OWNED) {
    try { process.kill(-p.pid, 'SIGKILL'); } catch { /* group already gone */ }
    try { p.kill('SIGKILL'); } catch { /* already gone */ }
  }
}
function die(code, why) {
  console.error('FAIL: ' + why);
  reap();
  process.exit(code);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { reap(); process.exit(130); });

// ────────────────────────────────────────────── 1. the host and the static server
const host = spawn(DOTNET, ['run', '--project', 'hosts/web', '--', '--port', String(HOST_PORT),
  '--ship', 'wreck'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
OWNED.push(host);
const serve = spawn('python3', ['client/serve.py', String(CLIENT_PORT)],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
OWNED.push(serve);
log('host pid', host.pid, '· client pid', serve.pid);

// ⛔ A PORT THAT ANSWERS BEFORE OUR OWN HOST COULD HAVE BUILT IS SOMEBODY ELSE'S. This rig once
// waited two seconds, found 8390 answering, and photographed a leaked host from its previous run.
// The host is given at least one build cycle before the first probe, and a socket that answers
// instantly is reported rather than used.
try {
  const stale = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  await new Promise((res, rej) => { stale.onopen = res; stale.onerror = rej; });
  stale.close();
  die(1, `something is ALREADY listening on ${HOST_PORT} — this rig will not photograph a host it `
    + 'did not start. Pick another --host-port, or kill that process by pid.');
} catch { /* nothing there: good */ }

let up = false;
for (let i = 0; i < 120 && !up; i += 1) {
  await sleep(1000);
  try {
    const ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.close(); up = true;
  } catch { /* still building */ }
}
if (!up) die(2, `no host answering on ${HOST_PORT} after two minutes`);
log('host up on', HOST_PORT);

// ────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'pm-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
OWNED.push(chrome);

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
cdp.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const call = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) =>
  (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))
    .result?.result?.value;
const json = async (expr) => {
  const s = await evaluate(`JSON.stringify(${expr})`);
  return (s && s !== 'null') ? JSON.parse(s) : null;
};
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
  return p;
}
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await call('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
    });
  }
};

// ⛔ THE INJECTION SHIM, installed BEFORE the document runs so it wraps the session's own socket.
// It records the handler `WireSession.connect` assigns and hands it back a synthetic frame; the
// client cannot tell the difference, which is the point — every layer below `onmessage` is real.
await call('Page.enable');
await call('Runtime.enable');
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const d = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', {
      configurable: true,
      get() { return d.get.call(this); },
      set(fn) { window.__pmSink = fn; d.set.call(this, fn); },
    });
    window.__pmInject = (o) => { window.__pmSink({ data: JSON.stringify(o) }); return true; };
  })();`,
});

await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
if (!(await evaluate('typeof window.__pmInject === "function" && typeof window.__pmSink === "function"'))) {
  die(7, 'the injection shim never saw the session socket — the wire seam has changed shape');
}

// ⛔ DISMISS THE ONBOARDING CARD, AND VERIFY IT WENT. The first run of this rig clicked THROUGH the
// card — every gesture landed on a modal, `#roomzoom-view` was never entered, and the shot it wrote
// was a photograph of the onboarding overlay captioned as a compartment. `.onb-begin` is the card's
// own primary action (`onboarding-shot.mjs` drives the same node).
await evaluate("(()=>{const b=document.querySelector('.onb-begin');if(b){b.click();return 1}return 0})()");
await sleep(800);
if (await evaluate("!!document.querySelector('.onb-card')")) die(7, 'the onboarding card would not dismiss');

// ────────────────────────────────────────────── 3. two rooms on deck 0, opened for real
const rooms = await json('(()=>{const r=[...document.querySelectorAll("[data-anchor]")]'
  + '.map(e=>({a:e.getAttribute("data-anchor"),r:e.getBoundingClientRect()}))'
  + '.filter(o=>o.r.width>30&&o.r.height>20);return r.map(o=>({a:o.a,x:o.r.x+o.r.width/2,y:o.r.y+o.r.height/2}))})()');
if (!rooms || rooms.length < 2) die(8, 'the Overview offered fewer than two openable compartments');
log('compartments on screen:', rooms.map((r) => r.a).join(', '));

/** The tiles the injected `materials` frame paints, for whichever room is focused. */
function materialsFrame(walls, floors) {
  const cells = [];
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 40; x += 1) {
      cells.push([x, y, 0, 0, walls[(x + y) % walls.length]]);      // kind 0 = wall
      cells.push([x, y, 0, 1, floors[(Math.floor(x / 3) + Math.floor(y / 3)) % floors.length]]);
    }
  }
  return { type: 'materials', cells };
}

const shots = [];
for (let i = 0; i < 2; i += 1) {
  const r = rooms[i];
  // ⚠️ "NOT HIDDEN" IS NOT "OPEN", AND ONE CLICK IS NOT A GESTURE THAT LANDED. The container exists
  // from boot, so the precondition is the SCENE — and the entry click is RETRIED against a
  // re-derived rectangle until the scene is there (`rig-lib.mjs`'s `verifiedClick` rule: a missed
  // click never resolves by waiting, and a cached rectangle is a bet on a surface that is repainting
  // at the wire's 10 Hz). Measured: the first cut clicked once, 1.5 s after BEGIN, and dropped a
  // room roughly one run in two.
  let open = 0;
  for (let try_ = 0; try_ < 4 && !open; try_ += 1) {
    const now = await json('(()=>{const e=document.querySelector(`[data-anchor="' + r.a + '"]`);'
      + 'if(!e)return null;const b=e.getBoundingClientRect();'
      + 'return {x:b.x+b.width/2,y:b.y+b.height/2};})()');
    if (!now) break;
    await clickAt(now.x, now.y);
    await sleep(1600);
    open = await evaluate('document.querySelectorAll("#roomzoom-view svg g").length');
  }
  if (!open) { log('  (room', r.a, 'never opened — skipping)'); continue; }
  shots.push(await png(`live-wreck-${i + 1}-${r.a}-authored.png`));

  // …and again with a mixed material set on the real channel
  const frame = materialsFrame(i === 0 ? [1, 4, 2] : [3, 5, 0], i === 0 ? [1, 4, 3] : [5, 2, 4]);
  const ok = await evaluate(`window.__pmInject(${JSON.stringify(frame)})`);
  if (!ok) die(9, 'the materials injection was refused');
  await sleep(1500);
  const drew = await json('(()=>{const s=document.querySelector("#roomzoom-view svg");if(!s)return null;'
    + 'return {walls:s.querySelectorAll(".rz-wall").length,floors:s.querySelectorAll(".rz-floor-mat > g").length}})()');
  log('  ', r.a, 'after injection →', JSON.stringify(drew));
  // ⚠️ `walls: 0` IS THE EXPECTED ANSWER ON THIS SHIP AND IS NOT A DEFECT — recorded here so the
  // next reader does not chase it. `materialLayerSvg` skins INTERIOR partitions only: a `#` on a
  // room's own ring is the compartment's hull and `roomCutawaySvg` has already drawn it (VR-P3's
  // MAJOR 1, the thirty-slab regression). `--ship wreck` authors no partition inside any
  // compartment, so a wall SKIN is only ever seen on a wall the player built — which is why the
  // wall row of `paper-materials-sheet.mjs` is the evidence for that half, through the same
  // shipping function over a planted tile.
  if (drew.walls === 0) log('    (no interior partition in this compartment — hull walls belong to the cutaway)');
  if (!drew || drew.floors < 4) {
    die(10, `${r.a}: the injected floors reached no skin (${JSON.stringify(drew)}) — this shot would `
      + 'photograph the authored ship and be captioned as a mixed one');
  }
  shots.push(await png(`live-wreck-${i + 1}-${r.a}-mixed.png`));
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(900);
}

if (shots.length < 4) die(11, `only ${shots.length} shots — two rooms x (authored, mixed) was the ask`);
log('\nOK — ' + shots.length + ' shots in ' + OUT);
reap();
process.exit(0);
