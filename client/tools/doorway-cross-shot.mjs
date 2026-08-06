#!/usr/bin/env node
// doorway-cross-shot.mjs — WALK A CREW MEMBER THROUGH A DOORWAY, BOTH WAYS, AND SAMPLE THE DRAWING
// AT DISPLAY RATE. The one instrument for the hardest cost of the SCENE INSET (2026-08-06).
//
// ⛔⛔ WHY IT EXISTS. The Room Zoom's scene is now the compartment's TRUE INTERIOR: the cutaway's
// wall planes land exactly where the wall-inclusive rect's ring tiles used to be drawn, so the
// outermost floor row is flush against the wall and a player can furnish it (the owner's ruling —
// see `room-model.js` `roomInterior`). But A DOOR OPENING LIVES ON THAT RING (`SlotGridPlanner` puts
// every compartment door on a perimeter row), so a crew member crossing one occupies, for the whole
// crossing, a tile the drawing has no floor for. Two failure modes, in opposite directions:
//
//   · NARROW THE MEMBERSHIP TEST WITH THE SCENE ⇒ she is DELETED for the length of every crossing.
//     A figure that blinks out in the doorway, and cannot be clicked while she is visible on the
//     other side of the threshold — the exact defect `roomCrew`'s header already paid for once.
//   · KEEP MEMBERSHIP AND PROJECT HER RAW POSITION ⇒ she is DRAWN BEHIND THE WALL, standing on
//     nothing. That is the screenshot review took of Rell on the cryo bay's back wall.
//
// The shipped mechanism splits the two questions: ADMIT on the wall-inclusive window
// (`tileInFocusRect`), DRAW on the floor (`clampPosToFloor`, which puts her feet exactly on the wall
// line — in the opening). This rig is the proof, and neither node test nor screenshot can be: the
// claim is about SCREEN POSITIONS OVER TIME while a real sim walks a real pawn.
//
// ⭐ ONE CLOCK, ONE LOOP. The sampler runs IN THE PAGE, inside a single rAF, and on every frame it
// records BOTH the wire's latest position for her (off a patched WebSocket — the page's own socket,
// so there is no cross-process clock to reconcile) AND what the pawn overlay is drawing. A rig that
// sampled the wire here and the DOM there could not tell a vanish from a scheduling gap.
//
// THE TWO VERDICTS, per direction:
//   V1  ZERO MID-CROSSING VANISH FRAMES — once the overlay has drawn her, it does not stop while
//       the WIRE still puts her inside the room's window. The frames between the roster message that
//       admits her and the repaint that answers it are the wire's ~10 Hz cadence against a 60 Hz
//       sampler; they are counted and REPORTED separately rather than folded into either verdict.
//       (Frames where the wire has not spoken yet are excluded and counted, so an empty sample set
//       cannot pass as a green run.)
//   V2  ZERO OFF-FLOOR DRAWS — on every frame where she IS drawn, her foot point lies inside the
//       drawn floor's projected quad (1 px of tolerance for the browser's own rounding).
//
// ⛔ AND A NON-VACUITY LEG: the run must actually CROSS. If the wire never reports her on a ring
//    tile the rig has measured nothing about doorways, and it says so and exits non-zero rather than
//    printing two zeros and a tick.
//
// It drives the sim on its OWN socket rather than through the page, for `pawn-tween-shot.mjs`'s
// reason: the subject is what the page DRAWS, so every gesture made through the page is a variable
// in its own measurement. The host runs ONE `GameSession` for all connections.
//
// EXIT CODES: 0 pass · 3 no host · 5/8 Chrome never came up · 7 the room never opened ·
//   9 nobody could be made to walk · 20 V1 failed · 21 V2 failed · 22 the crossing never happened.
//
// USAGE
//   1. ./play.sh --host-port 8676 --client-port 8677 --no-open
//   2. node client/tools/doorway-cross-shot.mjs --host-port 8676 --client-port 8677 [--anchor cryobay]

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, verifiedClick, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8676');
const CLIENT_PORT = +arg('client-port', '8677');
const CDP_PORT = +arg('cdp-port', '9396');
const OUT = resolve(arg('out', 'client/tools/shots-doorway'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAMPLE_MS = +arg('sample-ms', '9000');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// ── the rig's own socket: the wire, and the lever that makes somebody walk ──
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);
if (!latest.get('frame')) { console.error('no frame'); process.exit(3); }

const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const {
  deckSlots, roomDoorTiles, roomInterior, roomScene, scenePlacement, sceneFit,
} = await import('../src/ui/room-model.js');

const frame = latest.get('frame');
const DECK = frame.deck | 0;
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);

// ── choose the room: one with a boundary DOOR and a crew member standing in it ──
const roster = latest.get('roster');
const crew = (roster && roster.crew) || [];
if (!crew.length) { console.error('no crew aboard — nothing to walk'); process.exit(9); }
// ⛔ THE FAR SIDE OF THE DOOR MUST BE SOMEWHERE SHE CAN GO, OR NO CROSSING HAPPENS — and a run that
// walks her round the room instead measures nothing. The first version of this chooser took the
// first door it found; on a later ship state that door's far tile was not floor, the sim pathed her
// nowhere near it, and the run came back with `ON THE DOOR RING 0` and two green verdicts. The
// vacuity guard at the bottom caught it (that is what it is for), but the honest fix is to choose a
// crossing that can be driven. The frame's own glyph is the test: `.` floor, or an open doorway.
const WANT = arg('anchor', '');
const walkableAt = (tx, ty) => {
  if (tx < 0 || ty < 0 || tx >= (frame.w | 0) || ty >= (frame.h | 0)) return false;
  const c = frame.cells[ty * (frame.w | 0) + tx];
  if (!Array.isArray(c)) return false;
  const g = c[0] | 0;
  return g === 46 || g === 47 || g === 64 || g === 44;   // '.' floor · '/' open door · '@' pawn · ',' spoil
};
const farSide = (d) => (d.side === 'back' ? { x: d.tx, y: d.ty + 1 }
  : d.side === 'front' ? { x: d.tx, y: d.ty - 1 }
    : d.side === 'left' ? { x: d.tx - 1, y: d.ty } : { x: d.tx + 1, y: d.ty });
let pick = null;
for (const s of (WANT ? slots.filter((x) => x.anchorName === WANT) : slots)) {
  const f = { deck: DECK, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h };
  const iv = roomInterior(f);
  const who = crew.find((c) => (c.deck | 0) === DECK
    && c.x >= iv.rx && c.x < iv.rx + iv.rw && c.y >= iv.ry && c.y < iv.ry + iv.rh);
  if (!who) continue;
  const door = roomDoorTiles(frame, f, dView).find((d) => walkableAt(d.tx, d.ty)
    && walkableAt(farSide(d).x, farSide(d).y));
  if (door) { pick = { s, f, iv, door, who }; break; }
}
if (!pick) {
  console.error('no compartment on this deck has a crew member in it AND a boundary door whose far '
    + 'side she can walk to — the crossing cannot be driven, so nothing would be measured'
    + (WANT ? ` (--anchor ${WANT})` : ''));
  process.exit(9);
}
const { s: ROOM, f: focus, iv, door, who } = pick;
log(`ROOM ${ROOM.anchorName} window=${focus.rx},${focus.ry} ${focus.rw}x${focus.rh} `
  + `floor=${iv.rx},${iv.ry} ${iv.rw}x${iv.rh}`);
log(`DOOR ${door.tx},${door.ty} (${door.side})   CREW cid=${who.cid} at ${who.x},${who.y}`);

// The tile on the FAR side of the door — one step beyond it, out of this compartment.
const beyond = farSide(door);
const home = { x: who.x, y: who.y };
log(`WALK  ${home.x},${home.y}  →  ${beyond.x},${beyond.y}  (through the ${door.side} door)  and back`);

// ── Chrome ──
const userDir = mkdtempSync(join(tmpdir(), 'doorway-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid', chrome.pid);

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) die(chrome, 5, 'no devtools');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const v = await evaluate(`JSON.stringify(${expr})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
const mouse = (type, x, y, buttons = 0) => call('Input.dispatchMouseEvent',
  { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, buttons });
async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0);
}
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
  return p;
}
await call('Page.enable'); await call('Runtime.enable');

// ⭐ THE IN-PAGE ROSTER TAP. The page's own socket is patched before any script runs, so the wire
// position the sampler compares against is the one THIS PAGE received — not a second stream on the
// rig's socket with its own arrival times.
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__wire = null;
    const Orig = window.WebSocket;
    function Patched(u, p) {
      const s = p === undefined ? new Orig(u) : new Orig(u, p);
      s.addEventListener('message', (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m && m.type === 'roster' && Array.isArray(m.crew)) window.__wire = m.crew;
        } catch (x) {}
      });
      return s;
    }
    Patched.prototype = Orig.prototype;
    Patched.OPEN = Orig.OPEN; Patched.CLOSED = Orig.CLOSED;
    Patched.CONNECTING = Orig.CONNECTING; Patched.CLOSING = Orig.CLOSING;
    window.WebSocket = Patched;
  })();`,
});
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

await verifiedClick({
  what: `Room Zoom on ${ROOM.anchorName}`,
  target: () => centre(`.pl-room[data-anchor="${ROOM.anchorName}"]`),
  settled: async () => (await evaluate("document.body.classList.contains('roomzoom-open')?1:0")) === 1,
  clickAt, log, chrome, code: 7,
});
const layerBox = await waitFor('#rz-layers', async () => evalJson(
  "(()=>{const e=document.getElementById('rz-pawnlay')||document.getElementById('rz-layers');"
  + "if(!e)return null;const b=e.getBoundingClientRect();return b.width?{x:b.x,y:b.y,w:b.width,h:b.height}:null;})()"),
{ chrome, code: 8 });

// ── the floor quad in CLIENT px, through the SHIPPED derivations ──
// Parity by import: the quad this rig tests containment against is built from `roomScene` +
// `scenePlacement` + `sceneFit`, the same three the surface draws with. A hand-rolled projection here
// would be a second authority on the exact thing being measured.
const scene = roomScene(focus);
const fit = sceneFit(scene, layerBox.w, layerBox.h);
const place = scenePlacement(scene, focus, scene.s * 100);
const toClient = ([sx, sy]) => [layerBox.x + fit.offX + sx * fit.s, layerBox.y + fit.offY + sy * fit.s];
const QUAD = [
  toClient(place.corners(iv.rx, iv.ry).nearLeft),
  toClient(place.corners(iv.rx + iv.rw - 1, iv.ry).nearRight),
  toClient(place.corners(iv.rx + iv.rw - 1, iv.ry + iv.rh - 1).farRight),
  toClient(place.corners(iv.rx, iv.ry + iv.rh - 1).farLeft),
];
log('FLOOR QUAD (client px): ' + QUAD.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' | '));

/** Point-in-parallelogram, with a tolerance in px for the browser's own rounding of the transform. */
function insideQuad(p, quad, tol) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i], b = quad[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const cross = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len;
    if (Math.abs(cross) <= tol) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

// ── the sampler: ONE rAF loop, both facts per frame ──
const SAMPLER = (cid) => `(() => {
  window.__frames = [];
  window.__stop = false;
  const CID = ${JSON.stringify(String(cid))};
  const step = () => {
    if (window.__stop) return;
    const lay = document.getElementById('rz-pawnlay');
    const el = lay && lay.querySelector('[data-cid="' + CID + '"]');
    let foot = null;
    if (el) {
      const t = el.getAttribute('transform') || '';
      const m = /translate\\(([-\\d.]+)[ ,]+([-\\d.]+)\\)/.exec(t);
      if (m) {
        // The group's translate is in SCENE units; the element's own screen CTM turns it into client
        // px, which is what the containment test is expressed in.
        const r = lay.getBoundingClientRect();
        const vb = (lay.getAttribute('viewBox') || '0 0 1 1').split(/\\s+/).map(Number);
        const s = Math.min(r.width / vb[2], r.height / vb[3]);
        const offX = (r.width - vb[2] * s) / 2, offY = (r.height - vb[3] * s) / 2;
        foot = [r.x + offX + Number(m[1]) * s, r.y + offY + Number(m[2]) * s];
      }
    }
    const w = (window.__wire || []).find((c) => String(c.cid) === CID) || null;
    window.__frames.push({
      drawn: !!el, foot,
      wx: w ? (Number.isFinite(w.fx) ? w.fx : w.x) : null,
      wy: w ? (Number.isFinite(w.fy) ? w.fy : w.y) : null,
      wd: w ? (w.deck | 0) : null,
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return 1;
})()`;

const cmd = (o) => ws.send(JSON.stringify(o));
/** Where the HOST says she is RIGHT NOW — the rig's own socket keeps `roster` current.
 *  ⛔ NOT `home`. The first draft selected her by clicking the tile she STARTED on, which works for
 *  the outward trip and silently selects NOBODY for the return one (she is standing in the next
 *  compartment by then). The return leg reported 0 in-window frames and 0 vanishes — a green run
 *  that had measured nothing, which is the 4th trap shape wearing a rig. */
const whereIsShe = () => {
  const r = latest.get('roster');
  const c = ((r && r.crew) || []).find((e) => String(e.cid) === String(who.cid));
  return c ? { x: c.x | 0, y: c.y | 0 } : home;
};
async function walkTo(t, label) {
  const from = whereIsShe();
  log(`\n── ${label}: ${from.x},${from.y} → ${t.x},${t.y} ──`);
  await evaluate(`window.__stop = true;`);
  await sleep(60);
  await evaluate(SAMPLER(who.cid));
  cmd({ cmd: 'click', x: from.x, y: from.y });
  await sleep(300);
  cmd({ cmd: 'cursor', x: t.x, y: t.y });
  cmd({ cmd: 'move' });
  // ⭐ ONE PICTURE **IN** THE DOORWAY, for the owner. The measurement is the 60 Hz sample set below;
  // this is the frame that shows what it means — she is standing in the opening, on the wall line,
  // on a tile the drawing has no floor for. Polled off the rig's own socket so the capture is timed
  // by the SIM's position rather than by a guessed delay; it simply does not fire if she crosses
  // between two roster messages, and the run is unaffected either way.
  let shot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < SAMPLE_MS) {
    const p = whereIsShe();
    if (!shot && p.x === door.tx && p.y === door.ty) {
      shot = true;
      await png(`doorway-IN-THE-OPENING-${label.split(' ')[0].toLowerCase()}.png`);
    }
    await sleep(60);
  }
  await evaluate('window.__stop = true;');
  const frames = await evalJson('window.__frames');
  return frames || [];
}

const results = [];
for (const [t, label] of [[beyond, 'OUT through the doorway'], [home, 'BACK in through the doorway']]) {
  const frames = await walkTo(t, label);
  const inWindow = (x, y) => x >= focus.rx - 0.5 && x < focus.rx + focus.rw - 0.5
    && y >= focus.ry - 0.5 && y < focus.ry + focus.rh - 0.5;
  const onRing = (x, y) => inWindow(x, y)
    && !(Math.round(x) >= iv.rx && Math.round(x) < iv.rx + iv.rw
      && Math.round(y) >= iv.ry && Math.round(y) < iv.ry + iv.rh);
  const spoke = frames.filter((f) => f.wx != null && f.wd === DECK);
  const shouldDraw = spoke.filter((f) => inWindow(f.wx, f.wy));
  // ⭐⭐ A VANISH IS SPLIT INTO **ENTRY LATENCY** AND **MID-CROSSING**, AND ONLY THE SECOND FAILS —
  // measured, not assumed. The overlay's nodes are created by a REPAINT, which runs at the wire's
  // ~10 Hz cadence, while this sampler runs at the display's 60 Hz. So the frames between the roster
  // message that first puts her in the window and the repaint that answers it are a LATENCY that has
  // nothing to do with the doorway and would be there with no inset at all (the first run measured
  // exactly 1 such frame in ~1300). What the package is answerable for is a figure that was BEING
  // DRAWN and then stopped while still inside the room — so a vanish counts only when an earlier
  // frame of the SAME uninterrupted in-window run had her drawn.
  //
  // ⛔ AND THE LATENCY BUCKET IS **CAPPED**, or it becomes the hole the split was meant to avoid.
  // Driven: with `roomCrew` narrowed to the interior, the RE-ENTRY leg puts 103 consecutive frames
  // (~1.7 s) in this bucket — she is inside the window and undrawn for the whole crossing, and
  // "she was never drawn yet in this run" would have excused every one of them. One wire interval is
  // the tween model's own 250 ms ceiling, so a run of more than `LATENCY_CAP` frames is a VANISH.
  const LATENCY_CAP = +arg('latency-cap', '20');
  let seenDrawnThisRun = false;
  let runLatency = [];
  const entryLatency = [], midCrossing = [];
  const closeRun = () => {
    if (runLatency.length > LATENCY_CAP) midCrossing.push(...runLatency);
    else entryLatency.push(...runLatency);
    runLatency = [];
  };
  for (const f of frames) {
    const inWin = f.wx != null && f.wd === DECK && inWindow(f.wx, f.wy);
    if (!inWin) { closeRun(); seenDrawnThisRun = false; continue; }
    if (f.drawn) { closeRun(); seenDrawnThisRun = true; continue; }
    if (seenDrawnThisRun) midCrossing.push(f); else runLatency.push(f);
  }
  closeRun();
  const vanished = midCrossing;
  const drawnFrames = frames.filter((f) => f.drawn && f.foot);
  const offFloor = drawnFrames.filter((f) => !insideQuad(f.foot, QUAD, 1.0));
  const ringFrames = spoke.filter((f) => onRing(f.wx, f.wy));
  log(`  frames ${frames.length}   wire-spoke ${spoke.length}   in-window ${shouldDraw.length}   `
    + `drawn ${drawnFrames.length}   ON THE DOOR RING ${ringFrames.length}`);
  log(`  V1 MID-CROSSING vanish frames: ${vanished.length}   `
    + `(entry latency, not a defect: ${entryLatency.length})`);
  if (vanished.length) log('     worst: ' + JSON.stringify(vanished.slice(0, 3)));
  log(`  V2 off-floor draws: ${offFloor.length}`);
  if (offFloor.length) {
    log('     worst: ' + JSON.stringify(offFloor.slice(0, 3)));
  }
  results.push({ label, frames: frames.length, spoke: spoke.length, shouldDraw: shouldDraw.length,
    drawn: drawnFrames.length, ring: ringFrames.length, vanished: vanished.length,
    entryLatency: entryLatency.length, offFloor: offFloor.length });
  await png(`doorway-${results.length}-${label.split(' ')[0].toLowerCase()}.png`);
}

// ── verdicts ──
let fail = 0;
const totRing = results.reduce((n, r) => n + r.ring, 0);
const totVanish = results.reduce((n, r) => n + r.vanished, 0);
const totOff = results.reduce((n, r) => n + r.offFloor, 0);
const totDrawn = results.reduce((n, r) => n + r.drawn, 0);
log('\n══ VERDICTS ══');
log(`  frames on the DOOR RING (both directions): ${totRing}`);
if (!totRing) {
  log('  ⛔ FAIL — she never occupied a ring tile, so no crossing was measured. Two zeros below '
    + 'would be about nothing at all.');
  fail = 22;
}
if (!totDrawn) {
  log('  ⛔ FAIL — she was never drawn at all; V2 is vacuous.');
  fail = fail || 22;
}
const totLatency = results.reduce((n, r) => n + r.entryLatency, 0);
log(`  V1 ZERO MID-CROSSING VANISH FRAMES: ${totVanish === 0 ? '✔' : '⛔'}  (${totVanish}; `
  + `${totLatency} frames of message→repaint entry latency, which is the wire's cadence and not this)`);
if (totVanish) fail = fail || 20;
log(`  V2 ZERO OFF-FLOOR DRAWS: ${totOff === 0 ? '✔' : '⛔'}  (${totOff} of ${totDrawn} drawn frames)`);
if (totOff) fail = fail || 21;
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ room: ROOM.anchorName, focus, iv, door, results }, null, 1));
chrome.kill('SIGKILL');
log(fail ? '\nVERDICT: FAIL (' + fail + ')' : '\nVERDICT: PASS');
process.exit(fail);
