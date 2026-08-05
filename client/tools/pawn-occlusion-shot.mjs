#!/usr/bin/env node
// pawn-occlusion-shot.mjs — WALK A CREW MEMBER ONTO A CRYO CAPSULE AND PHOTOGRAPH THE TILE.
//
// ⚠️ WHY THIS EXISTS. The owner reported, from a screenshot: "when the pawn works across a capsule,
// the capsule disappears until the pawn is out of the cell." `devices-model.test.js` and
// `wear-join.test.js` now drive that defect on both surfaces, but a driven test plants a glyph byte
// in a fixture — it cannot say that a REAL pawn, walked by the REAL sim onto a REAL pod, leaves the
// capsule on screen. This repo's standing rule is that invisible feedback is broken feedback and
// that the owner judges the art from pictures, so the fix gets a picture.
//
// WHAT IT DOES
//   1. connects to a running `--ship wreck` host, steps to deck 0
//   2. finds a SEALED capsule ('K') and orders the crew member onto that exact tile
//      ({"cmd":"cursor",x,y} then {"cmd":"move"} — the same two messages the Room Zoom's MOVE tool
//      sends, so this drives the shipping order path and not a back door)
//   3. WAITS for the wire to show `Glyphs.Citizen` (64) ON the pod tile — that is the defect's
//      precondition, and the tool exits non-zero rather than photographing a pawn who never arrived
//   4. screenshots the cryo bay Room Zoom while she is standing there
//
// USAGE
//   ~/.dotnet/dotnet run --project hosts/web -- --port 8390 --ship wreck
//   python3 client/serve.py 8391
//   node client/tools/pawn-occlusion-shot.mjs --out <dir> --host-port 8390 --client-port 8391
//
// ⚠️ Leaks a headless Chrome on a failure after the spawn, exactly as `wreck-shot.mjs` does — the
// committed convention here, recorded rather than re-engineered. Kill the recorded PID, never a
// pattern (CLAUDE.md trap 5).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const OUT = resolve(arg('out', '.'));
const TAG = arg('tag', 'after');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9348');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
mkdirSync(OUT, { recursive: true });

const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
// ⚠️ A SETTLE WAIT, AND IT IS NOT COSMETIC: `wreck-shot.mjs`'s capsule census read 10 of 12 pods
// against a host started ~8 s earlier and 12 of 12 once settled. A rig that photographs the first
// frame it is handed photographs a partially-populated projection.
await sleep(3000);

const cellAt = (f, x, y) => { const c = f?.cells?.[y * f.w + x]; return Array.isArray(c) ? (c[0] | 0) : -1; };

for (let i = 0; i < 16 && (latest.get('frame')?.deck | 0) !== 0; i++) {
  send({ cmd: 'deck', dz: Math.sign(0 - (latest.get('frame')?.deck | 0)) });
  await sleep(450);
}
await sleep(1200);
const f0 = latest.get('frame');
if (!f0 || (f0.deck | 0) !== 0) die(2, 'could not reach deck 0');

// The target: a SEALED capsule, which is what the owner was looking at.
let target = null;
for (let y = 0; y < f0.h && !target; y++) {
  for (let x = 0; x < f0.w && !target; x++) if (cellAt(f0, x, y) === 'K'.charCodeAt(0)) target = [x, y];
}
if (!target) die(3, "no sealed capsule ('K') on deck 0 — is this --ship wreck?");
console.log(`target capsule tile ${target[0]},${target[1]}`);

// ⛔ SELECT HER FIRST, AND THE FIRST DRAFT DID NOT. `GameSession.MoveOrder()` is
// `if (_selected == 0) { _status = "no crew selected"; return; }` — a move order with nobody
// selected is DROPPED SILENTLY as far as this rig can see. The first run of this tool "succeeded"
// anyway, because the lone crew member happened to be idling on the pod tile already; the second
// run, with her a few tiles away, timed out. A rig whose success depends on where a pawn happens to
// be standing is a rig that will lie about the next fix too.
const pawn = (() => {
  const f = latest.get('frame');
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (cellAt(f, x, y) === 64) return [x, y];
  return null;
})();
if (!pawn) die(4, 'no crew member on deck 0 — nothing to walk');
console.log(`crew member at ${pawn[0]},${pawn[1]}`);
if (pawn[0] === target[0] && pawn[1] === target[1]) die(4, 'she is already on the target — pick another capsule');
send({ cmd: 'click', x: pawn[0], y: pawn[1] });   // selects her, exactly as a click on the plate does
await sleep(600);

// THE SHIPPING ORDER PATH: cursor, then move. Not a back door — these are the two messages
// `roomzoom-view.js` sends for the MOVE tool.
send({ cmd: 'cursor', x: target[0], y: target[1] });
await sleep(400);
send({ cmd: 'move' });

// WAIT FOR HER TO ARRIVE, and fail loudly if she does not: a picture of an empty pod tile would
// "prove" the fix while showing nothing at all.
let arrived = false;
for (let i = 0; i < 240 && !arrived; i++) {
  await sleep(500);
  if (cellAt(latest.get('frame'), target[0], target[1]) === 64) arrived = true;
}
if (!arrived) die(4, 'the crew member never reached the capsule tile — nothing to photograph');
console.log('the crew member is standing ON the capsule (frame carries 64 there)');

const profile = mkdtempSync(join(tmpdir(), 'pawnocc-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1600,1000', '--hide-scrollbars', '--disable-gpu',
  `http://localhost:${CLIENT_PORT}/index.html?port=${HOST_PORT}`,
], { stdio: 'ignore' });
console.log('chrome pid ' + chrome.pid + ' (kill THIS pid, never a pattern)');

let cdp = null;
for (let i = 0; i < 40 && !cdp; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) cdp = page.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!cdp) { chrome.kill(); die(5, 'chrome never exposed a CDP page'); }

let id = 0;
const pending = new Map();
const dbg = new WebSocket(cdp);
await new Promise((r) => { dbg.onopen = r; });
dbg.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); dbg.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.result?.value;

// ⛔ THE ROOM IS ENTERED WITH A REAL POINTER CLICK, NOT BY CALLING A GLOBAL. The first draft ran
// `window.RoomZoom.enterRoom('cryobay')` — and `RoomZoom` IS NOT A GLOBAL (the client is ES modules,
// nothing is hung on `window`), so the call was `undefined`, the Room Zoom never opened, `rz-layers`
// was the empty string, and the tool's own verdict line printed `false` for the fitting it was built
// to look for. A CONFIDENT FALSE NEGATIVE about the fix it exists to photograph. `wreck-shot.mjs`
// clicks `.pl-room[data-anchor=…]` for exactly this reason and its header records the same class of
// scar; the same gesture is used here, and the emptiness of `rz-layers` is now a hard failure rather
// than a quiet zero.
await cmd('Page.enable');
await cmd('Runtime.enable');
await sleep(7000);
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased'])
    await cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
};
const box = async (sel) => {
  const j = await evalJs(`JSON.stringify((()=>{const e=document.querySelector('${sel}');if(!e)return null;`
    + 'const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())');
  return j && j !== 'null' ? JSON.parse(j) : null;
};
// The onboarding takeover swallows every click on a fresh profile (wreck-shot.mjs's note).
const onb = await box('[data-onb-begin]');
if (onb) { await clickAt(onb.x, onb.y); await sleep(2500); }
for (const type of ['keyDown', 'keyUp'])
  await cmd('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(2000);
const room = await box('.pl-room[data-anchor="cryobay"]');
if (!room) { chrome.kill(); die(7, 'the cryo bay is not on the plate — cannot enter the Room Zoom'); }
await clickAt(room.x, room.y);
await sleep(3500);

const layerLen = await evalJs("((document.getElementById('rz-layers')||{}).innerHTML||'').length");
if (!(layerLen > 0)) { chrome.kill(); die(8, 'rz-layers is EMPTY — the Room Zoom never opened, so any verdict below would be vacuous'); }
console.log(`rz-layers carries ${layerLen} chars`);

const shot = await cmd('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
const file = join(OUT, `pawn-on-capsule-${TAG}.png`);
writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
console.log('wrote ' + file);

// The MEASUREMENT, beside the picture: does the furniture layer still carry the pod's own tile id?
const present = await evalJs(
  `(document.getElementById('rz-layers')||{}).innerHTML?.includes('rz-f-${target[0]}-${target[1]}') || false`);
const anyFitting = await evalJs(
  "(((document.getElementById('rz-layers')||{}).innerHTML||'').match(/rz-f-\\d+-\\d+/g)||[]).length");
console.log(`furniture layer carries rz-f-${target[0]}-${target[1]}: ${present}  (fittings drawn in this room: ${anyFitting})`);
chrome.kill();
process.exit(present ? 0 : 6);
