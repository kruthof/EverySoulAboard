#!/usr/bin/env node
// zoom-pawn-shot.mjs — DRIVE and PHOTOGRAPH M1-K (pawn control in the Room Zoom) in a RUNNING game.
//
// ⚠️ WHY THIS EXISTS, and why 1023 green node tests are not a substitute. Every assertion in
// `client/test/zoom-pawn.test.js` reads a wire payload out of an INJECTED `send` and markup out of a
// DOM stub with no layout. That proves the client EMITS `{cmd:'cursor'}`+`{cmd:'move'}` and that a
// `rz-sel-pool` string reaches `innerHTML`. It proves nothing about whether the crew member actually
// WALKS, and `dom-lite` has no layout, so a dock drawn off-screen or a glow drawn outside its own
// viewBox is byte-identical to one a player can see (`marks-shot.mjs`'s header records exactly that
// failure).
//
// SO THE HARD CHECKS HERE ARE ON THE WIRE AND ON MEASURED GEOMETRY, not on the pictures. The
// pictures are evidence a human can read; the counts and the pawn's moving x/y are evidence a
// machine can fail on.
//
// ⚠️ THE INSTRUMENT IS CHECKED AGAINST A KNOWN-TRUE FACT BEFORE ANY NEGATIVE RESULT IS BELIEVED
// (the M1-D lesson: two rigs published conclusions from silently broken instruments in one night).
// Every leg below either asserts a POSITIVE first — the selection really moved, the paint really
// landed — or declares itself UNREACHABLE ON THIS SHIP and says why.
//
// ⛔ WHAT THE SHIPPED WRECK CANNOT SHOW, measured over the wire rather than assumed:
//   · IT HAS EXACTLY ONE CREW MEMBER (`Rell`, cid 627). So "click a DIFFERENT pawn in the room and
//     the selection visibly moves" IS NOT EXERCISABLE on `--ship wreck` — there is no second pawn.
//     `--ship grid` (8 crew, still reachable by flag, the economy baseline) is where that leg runs,
//     and it runs with `--multi`. It is NOT routed around and NOT silently skipped.
//   · the wreck's deck 1 has NO enterable rooms at all, so every wreck leg is deck 0. `--ship grid`
//     is the opposite: its crew leave deck 0 within the first sim-minutes and settle in deck 1, so
//     the grid run needs `--deck 1`. Hard-coding either is what produced this rig's first false
//     finding ("no crew member on deck 0 at all", which was a fact about the rig).
//   · `--ship grid` crew take a DIG job seconds after being placed and walk back out of the room, so
//     sections 4–7 degrade to notes there rather than to failures. Those legs are validated on the
//     WRECK, which is the shipping game; `--multi` exists for the two-pawn leg and nothing else.
//
// USAGE
//   1. ./play.sh --host-port 8462 --client-port 8463 --no-open              (the wreck)
//      …or:  dotnet run --project hosts/web -- --port N --ship grid  + client/serve.py  (--multi)
//   2. node client/tools/zoom-pawn-shot.mjs --out docs/design/shots [--host-port 8462]
//      node client/tools/zoom-pawn-shot.mjs --host-port N --multi --deck 1     (the two-pawn leg)
//
// Exits non-zero if the host will not answer, if Chrome never paints, if a gesture does not land, or
// — the point — if the selection is invisible in the room, or a MOVE order does not move anybody.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const HOST_PORT = +arg('host-port', '8462');
const CLIENT_PORT = +arg('client-port', '8463');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'm1-k-');
const MULTI = has('multi');           // a ship with more than one crew member (--ship grid)
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9351');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('  x FAIL ' + msg); } else log('  ok  ' + msg); return ok; };
const note = (msg) => log('  ·   ' + msg);

// ───────────────────────────────────────────────────────────── 1. the wire, read as the client does
const latest = new Map();
const seen = { chat: 0 };
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (!m?.type) return;
    latest.set(m.type, m);
    if (m.type === 'chat') seen.chat += 1;   // the T-leak control reads this counter
  };
});
await sleep(3000);

const { decodeDecks, decodeRooms, selectedCrewCid } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, roomTileRect, roomFit, U } = await import('../src/ui/room-model.js');

// THE DECK IS A FLAG, not a constant, and the reason is a MEASURED fact about `--ship grid`: its
// eight crew migrate off deck 0 within the first sim-minutes and settle in deck 1's HOLD. A rig that
// hard-coded deck 0 reported "no crew member on deck 0 at all" and would have looked like a finding
// about the surface. (On `--ship wreck`, deck 0 is the only deck with enterable rooms at all.)
const DECK = +arg('deck', '0');
for (let i = 0; i < 20 && ((latest.get('frame')?.deck | 0) !== DECK); i++) {
  send({ cmd: 'deck', dz: Math.sign(DECK - (latest.get('frame')?.deck | 0)) });
  await sleep(450);
}
await sleep(1200);
if ((latest.get('frame')?.deck | 0) !== DECK) { console.error('FAIL: could not reach deck ' + DECK); process.exit(2); }
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);
const roster = () => (latest.get('roster')?.crew) || [];
const crewOf = (cid) => roster().find((c) => c.cid === cid) || null;
const inRect = (c, r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;

log('SHIP: ' + roster().length + ' crew · deck ' + DECK + ' rooms: '
  + slots.map((s) => `${s.anchorName}[${s.displayName}]`).join(' '));
for (const c of roster()) {
  const room = slots.find((s) => c.deck === DECK && inRect(c, s.rect));
  log(`  cid ${c.cid} ${c.name} @${c.x},${c.y} deck ${c.deck} — ${room ? room.displayName : 'NO ROOM (hall)'}`);
}
if (!roster().length) { console.error('FAIL: no crew on the wire — the rig is measuring nothing'); process.exit(2); }
if (!slots.length) { console.error('FAIL: no enterable room on deck 0'); process.exit(2); }

// ⚠️ SEEDING, ON A MULTI-CREW SHIP ONLY, AND IT IS NOT CIRCULAR — say why, because "the rig used the
// verb under test to set up the verb under test" is exactly what a reviewer should look for.
// MEASURED on `--ship grid`: all eight crew sit in the CENTRAL CORRIDOR (y = 8..9, between the two
// room bands at y0-7 and y10-17) and stay there — polled for 90 s, `max crew in one room = 0`. So the
// two-pawn leg has to put two of them in a room first. It does that over THE RIG'S OWN WEBSOCKET
// with the sim's own `click` + `cursor` + `move` commands — the WIRE, not the Room Zoom's palette.
// What is under test is the Room Zoom's PAWN CLICK, and no part of the seeding touches it.
const SEED_ROOM = slots.find((s) => s.anchorName === 'workshop') || slots[0];
if (MULTI) {
  const movers = roster().filter((c) => c.deck === DECK).slice(0, 2);
  if (movers.length === 2) {
    log(`SEEDING: walking ${movers.map((c) => c.name).join(' + ')} into ${SEED_ROOM.displayName} over the wire`);
    movers.forEach((c, i) => {
      send({ cmd: 'click', x: c.x, y: c.y });
      send({ cmd: 'cursor', x: SEED_ROOM.rect.x + 3 + i * 2, y: SEED_ROOM.rect.y + 3 });
      send({ cmd: 'move' });
    });
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      const inside = roster().filter((c) => c.deck === DECK && inRect(c, SEED_ROOM.rect));
      if (inside.length >= 2) { log('  seeded after ' + i + 's: ' + inside.map((c) => c.name).join(' + ')); break; }
    }
    const inside = roster().filter((c) => c.deck === DECK && inRect(c, SEED_ROOM.rect));
    log('  in ' + SEED_ROOM.displayName + ' now: ' + inside.map((c) => `${c.name}@${c.x},${c.y}`).join(' '));
  }
}

// THE SUBJECT and HER ROOM, both derived from the wire. Anything hard-coded here is a rig that stops
// being true the day the authored ship moves.
const SUBJECT = roster().find((c) => c.deck === DECK && slots.some((s) => inRect(c, s.rect)))
  || roster().find((c) => c.deck === DECK);
if (!SUBJECT) { console.error('FAIL: no crew member on deck 0 at all'); process.exit(2); }
const HER_SLOT = slots.find((s) => inRect(SUBJECT, s.rect)) || null;
const OTHER_SLOT = slots.find((s) => s !== HER_SLOT) || null;
log(`SUBJECT: ${SUBJECT.name} (cid ${SUBJECT.cid}) in ${HER_SLOT ? HER_SLOT.displayName : 'a hall'}`);
if (!HER_SLOT) { console.error('FAIL: the subject is in no room; this rig needs one to enter'); process.exit(2); }
if (!OTHER_SLOT) { console.error('FAIL: the ship has only one room, so "go to where they are" cannot be shown'); process.exit(2); }

// ───────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'zoom-pawn-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1440,900'),
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
  } catch { /* not up */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const v = await evaluate(`JSON.stringify(${expr})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '2') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const mouse = (type, x, y) => call('Input.dispatchMouseEvent',
  { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
async function clickAt(x, y) { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
async function key(k) {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k.length === 1 ? k : undefined });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
}
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
const toast = async (el) => evaluate(
  `(()=>{const t=document.getElementById('${el}');if(!t)return '(no #${el})';return t.hidden?'(HIDDEN) '+t.textContent:t.textContent;})()`);

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

// ─────────────────────────────────────── 3. THE OVERVIEW: select her, exactly as a player would
log('\n=== OVERVIEW: select the crew member ===');
const pawnG = await centre(`.pl-pawn[data-cid="${SUBJECT.cid}"]`);
if (pawnG) { await clickAt(pawnG.x, pawnG.y); } else {
  note('no .pl-pawn node for the subject — falling back to her CREW WATCH row');
  const row = await centre(`[data-ov-crew="${SUBJECT.cid}"]`);
  if (!row) { console.error('FAIL: neither a pawn nor a crew row for the subject'); process.exit(9); }
  await clickAt(row.x, row.y);
}
await sleep(2000);
// ⭐ THE INSTRUMENT CHECK. If this fails, every "the selection is invisible" claim below would be a
// statement about a selection that never happened.
const selNow = () => selectedCrewCid(latest.get('frame'));
check(selNow() === SUBJECT.cid,
  `the HOST reports ${SUBJECT.name} selected (frame.sel → cid ${selNow()}) — the instrument is live`);
await png('01-overview-selected.png');

// ─────────────────────────────────────── 4. ROOM ZOOM: enter a room she is NOT in
//
// ⚠️ THE SUBJECT'S ROOM IS RE-DERIVED HERE, NOT REUSED FROM THE PROBE, and that correction is worth
// its lines: on `--ship grid` the crew take a dig job within seconds and walk straight back out into
// the corridor, so the first version of this rig reported SEVEN FAILURES describing a surface that
// was behaving perfectly — the dock said `DECK 1` and the row click toasted `… IS NOT IN A ROOM`,
// both correct. A precondition that has EVAPORATED is reported as unreachable, never as a failure;
// the alternative is an instrument that manufactures findings on a busy ship.
const stillIn = () => {
  const c = crewOf(SUBJECT.cid);
  return c && c.deck === DECK ? slots.find((s) => inRect(c, s.rect)) || null : null;
};
const roomNow = stillIn();
if (!roomNow) {
  note(`UNREACHABLE RIGHT NOW: ${SUBJECT.name} left ${HER_SLOT.displayName} between the wire probe `
    + 'and the browser (grid crew take a dig job and walk into the corridor). Sections 4–7 need her '
    + 'to be standing in a room. Run these legs on `--ship wreck`, where the one crew member services '
    + 'a wing inside REACTOR and stays put. The two-pawn leg below does NOT need this and still runs.');
}
log(`\n=== ROOM ZOOM: enter ${OTHER_SLOT.displayName} (she is in ${HER_SLOT.displayName}) ===`);
const gate = (ok, msg) => (roomNow ? check(ok, msg) : note('(skipped, precondition gone) ' + msg));
const otherRoom = await centre(`.pl-room[data-anchor="${OTHER_SLOT.anchorName}"]`);
if (!otherRoom) { console.error('FAIL: no .pl-room node for ' + OTHER_SLOT.anchorName); process.exit(10); }
await clickAt(otherRoom.x, otherRoom.y);
await sleep(2500);
gate(await evaluate(`document.body.classList.contains('roomzoom-open')`), 'the Room Zoom opened');

const dock = await evalJson(`(()=>{const d=document.getElementById('rz-crewdock');if(!d)return null;const r=d.getBoundingClientRect();`
  + `const rows=[...d.querySelectorAll('.rz-crew')].map(b=>({cid:b.getAttribute('data-rzcrew'),sel:b.classList.contains('sel'),`
  + `pressed:b.getAttribute('aria-pressed'),text:b.textContent}));`
  + `return {x:r.x,y:r.y,w:r.width,h:r.height,vis:r.width>0&&r.height>0,hdr:d.textContent.slice(0,40),rows};})()`);
gate(!!dock && dock.vis, 'the CREW DOCK is on screen and has a real box (a dock with no layout is '
  + 'the invisible-feedback failure this package exists to remove)');
gate(!!dock && dock.rows.length === roster().length,
  `the dock lists every soul aboard (${dock ? dock.rows.length : 0} rows / ${roster().length} crew)`);
const herRow = dock?.rows.find((r) => r.cid === String(SUBJECT.cid));
gate(!!herRow && herRow.sel && herRow.pressed === 'true',
  `${SUBJECT.name}'s row is lit AND says aria-pressed="true" — THE OWNER'S ACTUAL COMPLAINT: on `
  + '`main` nothing in this surface said who was selected');
gate(!!herRow && /HERE|[A-Z]/.test(herRow.text) && herRow.text.includes(HER_SLOT.displayName.toUpperCase()),
  `her row names the room she is actually in (${HER_SLOT.displayName}) — "where do I go to find her"`);
log('  DOCK ROWS: ' + JSON.stringify(dock?.rows));
await png('02-roomzoom-dock-elsewhere.png');
if (dock?.vis) {
  await png('03-roomzoom-dock-crop.png',
    { x: Math.max(0, dock.x - 12), y: Math.max(0, dock.y - 12), width: dock.w + 24, height: dock.h + 24 });
}

// ─────────────────────────────────────── 5. THE DOCK ROW CLICK: select + go there (colonist bar)
log('\n=== DOCK ROW CLICK: go to where she is ===');
const rowBox = await centre(`[data-rzcrew="${SUBJECT.cid}"]`);
if (!rowBox) { console.error('FAIL: her dock row has no box'); process.exit(11); }
await clickAt(rowBox.x, rowBox.y);
await sleep(2000);
const leaf = await evaluate(`document.querySelector('.rz-crumb-leaf')?.textContent || ''`);
gate(leaf.toUpperCase().includes(HER_SLOT.displayName.toUpperCase()),
  `the Room Zoom went to ${HER_SLOT.displayName} (breadcrumb reads "${leaf}") — RimWorld's colonist `
  + 'bar both selects and moves the camera');
log('  ROOM ZOOM TOAST: ' + JSON.stringify(await toast('rz-toast')));

// ⭐ THE SELECTION IS NOW VISIBLE ON THE FLOOR — the thing that did not exist on `main`.
const layer = await evaluate(`document.getElementById('rz-layers')?.innerHTML || ''`);
gate(layer.includes('rz-sel-pool'), 'the SELECTION GLOW is drawn under her — the Room Zoom finally '
  + 'reads `frame.sel`, which it never did before M1-K');
gate(layer.includes('rz-sel-' + SUBJECT.cid), 'the glow is keyed to HER cid, not to a constant');
const surname = String(SUBJECT.name).trim().split(/\s+/).pop().toUpperCase();
gate(layer.includes(surname), `her NAME (${surname}) is drawn at her feet — VS-Z-29's "no name tag" `
  + 'rule was retracted because the readout it pointed at is display:none here');
await png('04-roomzoom-selected-pawn.png');
const layerBox = await evalJson(`(()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
// A tight crop around her tile, so a human can see the glow + the pill without hunting.
const focus = roomTileRect(dView, HER_SLOT.anchorName);
const fit = roomFit(focus, layerBox.w, layerBox.h);
const her = crewOf(SUBJECT.cid);
const screenOf = (tx, ty) => ({
  x: layerBox.x + fit.offX + (tx - focus.rx) * U * fit.s + (U / 2) * fit.s,
  y: layerBox.y + fit.offY + (ty - focus.ry) * U * fit.s + (U / 2) * fit.s,
});
{
  const p = screenOf(her.x, her.y);
  const pad = 90;
  await png('05-roomzoom-pawn-crop.png',
    { x: Math.max(0, p.x - pad), y: Math.max(0, p.y - pad * 1.4), width: pad * 2, height: pad * 2.4 });
}

// ─────────────────────────────────────── 6. THE MOVE ORDER — and she must actually WALK
log('\n=== MOVE [M]: give her an order from inside the room ===');
const palMove = await centre('[data-rztool="move"]');
gate(!!palMove, 'the ➤ MOVE tool is on the Room Zoom palette');
await key('m');
await sleep(700);
const armed = await evaluate(`document.querySelector('[data-rztool="move"]')?.getAttribute('aria-pressed')`);
gate(armed === 'true', 'the [M] hotkey armed MOVE (aria-pressed="true") — on `main` this key '
  + 'reached the deprecated console and sent a REAL move order to an invisible cursor at 32,10');
await png('06-roomzoom-move-armed.png');

// A destination inside the room, as far from her as the rect allows, on a tile the sim will accept.
const before = crewOf(SUBJECT.cid);
const dest = { x: focus.rx + (before.x - focus.rx < focus.rw / 2 ? focus.rw - 2 : 1), y: before.y };
const dp = screenOf(dest.x, dest.y);
log(`  she is at ${before.x},${before.y}; ordering her to ${dest.x},${dest.y}`);
await clickAt(dp.x, dp.y);
await sleep(1200);
const moveToast = await toast('rz-toast');
log('  ROOM ZOOM TOAST: ' + JSON.stringify(moveToast));
gate(!/HIDDEN/.test(moveToast) && new RegExp(surname).test(moveToast),
  'the order named who it was given to, visibly');
await png('07-roomzoom-move-toast.png');

// ⭐ THE END-TO-END PROOF: the sim moved her. Polled off the roster, which is the host's own answer.
let walked = false, last = before;
for (let i = 0; i < 40 && !walked; i++) {
  await sleep(500);
  last = crewOf(SUBJECT.cid);
  if (!last) break;
  const closer = Math.abs(last.x - dest.x) < Math.abs(before.x - dest.x);
  if (closer || (last.x === dest.x && last.y === dest.y)) walked = true;
}
gate(walked, `${SUBJECT.name} WALKED — ${before.x},${before.y} → ${last?.x},${last?.y} toward `
  + `${dest.x},${dest.y}. This is the whole package: order → pawn does it → the ship changes.`);
await png('08-roomzoom-after-move.png');

// ─────────────────────────────────────── 7. THE INVISIBLE-CURSOR KEY LEAK, in a real browser
log('\n=== KEY LEAK: T must not reach the hidden dialogue while a room is open ===');
await key('Escape');            // disarm MOVE so the key state is clean
await sleep(600);
const chatBefore = seen.chat;
await key('T');
await sleep(3500);
const chatInRoom = seen.chat - chatBefore;
// The CONTROL first, because a "no chat arrived" result from a rig that can never see a chat is the
// exact failure this file's header is about. Leave the room and press the same key.
await key('Escape');
await sleep(1500);
const inOverview = await evaluate(`!document.body.classList.contains('roomzoom-open')`);
const chatMid = seen.chat;
await key('T');
await sleep(6000);
const chatOutside = seen.chat - chatMid;
if (!inOverview) {
  note('could not get back to the Overview — the T-leak CONTROL did not run, so the in-room result '
    + 'below is NOT evidence. Reported as unreachable rather than as a pass.');
} else if (chatOutside === 0) {
  note(`UNREACHABLE ON THIS HOST: pressing T on the Overview produced no 'chat' message either `
    + `(${chatOutside}). The instrument cannot see the thing it is looking for — most likely the `
    + 'dialogue backend declined. The in-room result (' + chatInRoom + ') is therefore NOT evidence '
    + 'and is NOT counted as a pass. The node suite pins this seam directly (`consoleKeys`).');
} else {
  check(chatInRoom === 0,
    `T inside a room opened NO conversation (${chatInRoom}), while the same key on the Overview `
    + `opened ${chatOutside} — the console keymap really is standing down, measured in a browser`);
}
await png('09-back-on-overview.png');

// ─────────────────────────────────────── 8. THE SECOND PAWN — only on a multi-crew ship
log('\n=== SECOND PAWN: clicking a different pawn in the room moves the selection ===');
if (!MULTI || roster().length < 2) {
  note(`UNREACHABLE ON THIS SHIP: --ship wreck has ${roster().length} crew member(s), so there is no `
    + 'second pawn to click. Run this rig with --multi against a host started with `--ship grid` '
    + '(8 crew). NOT routed around, NOT counted.');
} else {
  const room = slots.map((s) => ({ s, in: roster().filter((c) => c.deck === DECK && inRect(c, s.rect)) }))
    .sort((a, b) => b.in.length - a.in.length)[0];
  if (room.in.length < 2) {
    note(`UNREACHABLE RIGHT NOW: the fullest room (${room.s.displayName}) holds ${room.in.length} `
      + 'crew, and this leg needs two in ONE room. The seeding above did not land — say so rather '
      + 'than reporting a pass.');
  } else {
    const r2 = await centre(`.pl-room[data-anchor="${room.s.anchorName}"]`);
    if (r2) { await clickAt(r2.x, r2.y); await sleep(2500); }
    const f2 = roomTileRect(dView, room.s.anchorName);
    const lb = await evalJson(`(()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const fit2 = roomFit(f2, lb.w, lb.h);
    const at = (c) => ({
      x: lb.x + fit2.offX + (c.x - f2.rx) * U * fit2.s + (U / 2) * fit2.s,
      y: lb.y + fit2.offY + (c.y - f2.ry) * U * fit2.s + (U / 2) * fit2.s,
    });
    const [a, b] = room.in;
    await clickAt(at(a).x, at(a).y); await sleep(1800);
    const first = selNow();
    check(first === a.cid, `clicking ${a.name}'s pawn selected her (cid ${first})`);
    await png('10-grid-first-pawn.png');
    const layerA = await evaluate(`document.getElementById('rz-layers')?.innerHTML || ''`);
    check(layerA.includes('rz-sel-' + a.cid), 'her glow is on the floor');
    await clickAt(at(b).x, at(b).y); await sleep(1800);
    check(selNow() === b.cid, `clicking ${b.name}'s pawn MOVED the selection (cid ${selNow()})`);
    const layerB = await evaluate(`document.getElementById('rz-layers')?.innerHTML || ''`);
    check(layerB.includes('rz-sel-' + b.cid) && !layerB.includes('rz-sel-' + a.cid),
      'the glow moved with it — one selected pawn at a time');
    await png('11-grid-second-pawn.png');
  }
}

log('\n' + (failures ? `FAILURES: ${failures}` : 'ALL CHECKS PASSED'));
chrome.kill('SIGKILL');
try { ws.close(); cdp.close(); } catch { /* closing */ }
process.exit(failures ? 1 : 0);
