#!/usr/bin/env node
// erase-shot.mjs — DRIVE and PHOTOGRAPH the M1-C un-designate verb in a RUNNING game.
//
// ⚠️ WHY THIS EXISTS, and why a green suite is not a substitute. Every assertion in `client/test/`
// about ERASE reads a wire payload out of an INJECTED `send`. That proves the client emits
// `{cmd:'dig',…,on:0}`; it proves nothing about whether the mark GOES AWAY — the sim is not in the
// loop — and `dom-lite` has no layout, so a mark layer drawn outside its own viewBox is
// byte-identical to one a player can see (`marks-shot.mjs`'s header records exactly that failure).
//
// SO THIS TOOL ASSERTS ON THE `marks` CHANNEL, NOT ON THE SCREENSHOT. It counts what the HOST
// reports before and after each gesture, over the same WebSocket the game uses. The pictures are
// evidence a human can read; the counts are evidence a machine can fail on.
//
// ⚠️ EVERY ERASE CHECK IS GATED ON ITS OWN PAINT HAVING LANDED, and a paint that does not land is a
// FAILURE, never a skip. The first draft of this file did not do that and reported
// "✓ ERASE took the STRIP order back (0 → 0)" — a green produced by a strip the sim had REFUSED
// (kind 0 is a Door, and `DeconstructSystem` refuses doors). That is the repo's own "a test that
// passes if the system under test does nothing at all", caught here by running it.
//
// WHAT THE SHIPPED WRECK CAN AND CANNOT SHOW, measured over the wire rather than assumed:
//   · deck 0 carries 20 debris tiles and deck 1 carries 60 — but ALL of deck 0's are in HALLS, and
//     deck 1 has NO enterable rooms at all. So DIG cannot be exercised inside the Room Zoom on this
//     ship; it is exercised on the OVERVIEW, which is deck-scoped and can designate a hall tile.
//   · every device kind except 0 (Door) is strippable, so the Room Zoom's STRIP leg picks a
//     non-door.
//   · STOCKPILE works on any walkable empty tile, and it is the leg worth having: it is the one
//     verb whose PAINT is two commands (`stockpile` + `filter`) and whose ERASE is deliberately one.
//
// USAGE
//   1. ./play.sh --host-port 8442 --client-port 8443 --no-open
//   2. node client/tools/erase-shot.mjs --out docs/design/shots [--host-port 8442] [--client-port 8443]
//
// Exits non-zero if the host will not answer, if Chrome never paints, if a paint does not land, or
// — the point — if an erase leaves the designation on the tile.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8442');
const CLIENT_PORT = +arg('client-port', '8443');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'm1-c-');
const DECK = +arg('deck', '0');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9345');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('  x FAIL ' + msg); } else log('  ok  ' + msg); return ok; };

// ───────────────────────────────────────────────────────────── 1. the wire, read as the client does
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
for (let i = 0; i < 16; i++) {
  const cur = latest.get('frame')?.deck | 0;
  if (cur === DECK) break;
  send({ cmd: 'deck', dz: Math.sign(DECK - cur) });
  await sleep(450);
}
await sleep(1200);
if ((latest.get('frame')?.deck | 0) !== DECK) { console.error('FAIL: could not reach deck ' + DECK); process.exit(2); }

// Decoded by the CLIENT'S OWN modules — this tool cannot drift from what the surface believes.
const { decodeDecks, decodeRooms, decodeMarks, decodeDevices } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');
const { makeTransform } = await import('../src/ui/overview-scene.js');

const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK);
const roomRects = slots.filter((s) => s.anchorName).map((s) => ({ anchor: s.anchorName, ...s.rect }));
const inRect = (t, r) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;
const marksNow = () => (decodeMarks(latest.get('marks')) || []).filter((m) => m.deck === DECK);
const count = (kind, r) => marksNow().filter((m) => m.mark === kind && (!r || inRect(m, r))).length;

const devices = (decodeDevices(latest.get('devices')) || []).filter((d) => d.deck === DECK);
log('rooms on deck', DECK + ':', roomRects.map((r) => `${r.anchor}@${r.x},${r.y} ${r.w}x${r.h}`).join(' | '));
log('debris on this deck:', count('debris', null), '| devices:', devices.length);

// The room: the one with the most NON-DOOR devices (kind 0 is a Door and STRIP refuses it — the sim
// says so, measured, not assumed) and the most floor to zone.
const DOOR_KIND = 0;
const scored = roomRects.map((r) => ({ r, strippable: devices.filter((d) => d.kind !== DOOR_KIND && inRect(d, r)) }))
  .sort((a, b) => b.strippable.length - a.strippable.length);
for (const s of scored) log(`  ${s.r.anchor}: strippable devices = ${s.strippable.length}`);
const room = scored[0].r;
const strippable = scored[0].strippable;
if (!strippable.length) { console.error('FAIL: no strippable (non-door) device in any enterable room'); process.exit(3); }
log(`WORKING ROOM: ${room.anchor} @${room.x},${room.y} ${room.w}x${room.h}`);

// ───────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'erase-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1280,800'),
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
/** A real press-drag-release, with moves in between so `onCanvasMove` opens the rectangle. */
async function dragFrom(a, b) {
  await mouse('mousePressed', a.x, a.y);
  await mouse('mouseMoved', (a.x + b.x) / 2, (a.y + b.y) / 2);
  await mouse('mouseMoved', b.x, b.y);
  await mouse('mouseReleased', b.x, b.y);
}
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
/** The toast INCLUDING its `hidden` flag — a toast written into a hidden node is the invisible
 *  feedback this package exists to remove, and is textually identical to a visible one. */
const toast = async (el) => evaluate(
  `(()=>{const t=document.getElementById('${el}');if(!t)return '(no #${el})';return t.hidden?'(HIDDEN) '+t.textContent:t.textContent;})()`);
async function toastCrop(name, el) {
  const c = await evalJson(`(()=>{const t=document.getElementById('${el}');if(!t||t.hidden)return null;const r=t.getBoundingClientRect();if(!r.width)return null;const pad=30;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})()`);
  if (c) return png(name, c);
  log('  (the toast was already hidden — no crop for ' + name + ')');
  return null;
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) {
  console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it');
  process.exit(8);
}

// ───────────────────────────────────────────────────────────── 3. THE OVERVIEW — DIG, then ERASE
// Done FIRST because the Overview is deck-scoped and can designate a HALL tile, which is where all
// of this ship's deck-0 debris is. `xMidYMid meet` letterboxing, inverted the same way the
// controller's own `pointToTile` does.
log('\n=== OVERVIEW: paint a DIG on a debris tile, then ERASE it ===');
const ovSvg = await evalJson(`(()=>{const e=document.querySelector('svg.pl-overview');if(!e)return null;const r=e.getBoundingClientRect();const vb=e.getAttribute('viewBox').split(' ').map(Number);return {x:r.x,y:r.y,w:r.width,h:r.height,vw:vb[2],vh:vb[3]};})()`);
if (!ovSvg) { console.error('FAIL: no svg.pl-overview in the DOM'); process.exit(7); }
const T = makeTransform(slots, latest.get('frame'));
const ovScale = Math.min(ovSvg.w / ovSvg.vw, ovSvg.h / ovSvg.vh);
const ovOffX = ovSvg.x + (ovSvg.w - ovSvg.vw * ovScale) / 2;
const ovOffY = ovSvg.y + (ovSvg.h - ovSvg.vh * ovScale) / 2;
const ovScreenOf = (tx, ty) => { const [vx, vy] = T.project(tx + 0.5, ty + 0.5); return { x: ovOffX + vx * ovScale, y: ovOffY + vy * ovScale }; };

const buildTab = await centre('[data-ov-tab="build"]');
if (buildTab) { await clickAt(buildTab.x, buildTab.y); await sleep(900); }
const ovDigBtn = await centre('[data-ov-tool="dig"]');
const ovEraseBtn = await centre('[data-ov-tool="erase"]');
check(!!ovEraseBtn, 'the Overview ORDERS bar carries an ERASE button');
await png('01-overview-orders-bar.png');
const barCrop = await evalJson(`(()=>{const e=document.querySelector('.ov-orders');if(!e)return null;const r=e.getBoundingClientRect();const pad=10;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})()`);
if (barCrop) await png('02-overview-orders-bar-crop.png', barCrop);

const debris = marksNow().filter((m) => m.mark === 'debris');
log('  debris tiles on this deck:', debris.length, debris.slice(0, 6).map((m) => `${m.x},${m.y}`).join(' '), '…');
if (ovDigBtn && ovEraseBtn && debris.length) {
  const t = debris[0];
  const p = ovScreenOf(t.x, t.y);
  const before = count('dig', null);
  await clickAt(ovDigBtn.x, ovDigBtn.y); await sleep(800);
  log(`  clicking debris tile ${t.x},${t.y} at ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
  await clickAt(p.x, p.y);
  await sleep(1800);
  const painted = count('dig', null);
  const landed = check(painted === before + 1, `a DIG landed on the Overview (${before} -> ${painted})`);
  log('  OVERVIEW TOAST:', JSON.stringify(await toast('ov-toast')));
  await png('03-overview-dig-painted.png');

  if (landed) {
    await clickAt(ovEraseBtn.x, ovEraseBtn.y); await sleep(800);
    await png('04-overview-erase-armed.png');
    await clickAt(p.x, p.y);
    await sleep(1800);
    const tline = await toast('ov-toast');
    log('  OVERVIEW TOAST:', JSON.stringify(tline));
    await toastCrop('05-overview-erase-toast.png', 'ov-toast');
    check(count('dig', null) === before, `ERASE on the OVERVIEW took the DIG back (${painted} -> ${count('dig', null)})`);
    check(/ERASED DIG/.test(tline) && !/HIDDEN/.test(tline), 'the Overview said ERASED DIG, visibly');
    await png('06-overview-erased.png');

    // …and the MISS, which is the case that sends nothing and therefore most needs words.
    await clickAt(p.x, p.y);
    await sleep(1500);
    const missLine = await toast('ov-toast');
    log('  OVERVIEW TOAST on an already-clear tile:', JSON.stringify(missLine));
    check(/NOTHING TO ERASE/.test(missLine) && !/HIDDEN/.test(missLine),
      'erasing an unordered tile says NOTHING TO ERASE, visibly');
    await toastCrop('07-overview-nothing-to-erase.png', 'ov-toast');

    // ── THE CHARTER'S ACCEPTANCE STEP 3, ADDED IN REVIEW (2026-07-29): paint FOUR, erase ONE, and
    // watch the other three STAY. It is the step that distinguishes "erase works" from "erase
    // clears the deck", and it is done HERE rather than in the Room Zoom for the reason this file's
    // header gives — every one of this ship's deck-0 debris tiles is in a hall.
    if (debris.length >= 4) {
      const four = debris.slice(0, 4);
      log('  four debris tiles:', four.map((m) => `${m.x},${m.y}`).join(' '));
      await clickAt(ovDigBtn.x, ovDigBtn.y); await sleep(700);
      for (const d of four) { const q = ovScreenOf(d.x, d.y); await clickAt(q.x, q.y); await sleep(350); }
      await sleep(1500);
      const four4 = count('dig', null);
      const painted4 = check(four4 === before + 4, `FOUR digs painted (${before} -> ${four4})`);
      await png('15-overview-four-digs.png');
      if (painted4) {
        await clickAt(ovEraseBtn.x, ovEraseBtn.y); await sleep(700);
        const q0 = ovScreenOf(four[0].x, four[0].y);
        await clickAt(q0.x, q0.y);
        await sleep(1600);
        const left = count('dig', null);
        check(left === before + 3,
          `ONE erase took back exactly ONE order and left the other three (${four4} -> ${left})`);
        // …and it took back the RIGHT one — the tile clicked, not simply "one of them".
        const survivors = marksNow().filter((m) => m.mark === 'dig').map((m) => `${m.x},${m.y}`);
        check(!survivors.includes(`${four[0].x},${four[0].y}`) && survivors.length === 3,
          `the surviving orders are the three NOT clicked (${survivors.join(' ')})`);
        await png('16-overview-one-erased-three-left.png');
        // clear the rest so the tool leaves the ship as it found it
        for (const d of four.slice(1)) { const q = ovScreenOf(d.x, d.y); await clickAt(q.x, q.y); await sleep(350); }
        await sleep(1500);
        check(count('dig', null) === before, `the remaining three were taken back (${count('dig', null)} left)`);
        await png('17-overview-all-erased.png');
      }
    } else log(`  (SKIPPED acceptance step 3: only ${debris.length} debris tiles on this deck)`);
    await clickAt(ovEraseBtn.x, ovEraseBtn.y); await sleep(600);   // disarm before entering the room
  }
} else check(false, 'the Overview leg could not run (no dig/erase button, or no debris on this deck)');

// ── ⚠️ THE IN-ROOM ERASE, ON THE OVERVIEW. THIS LEG EXISTS BECAUSE OF A BLIND SPOT THIS TOOL HAD.
// Every one of the ship's deck-0 debris tiles is in a HALL, so every leg above clicks a hall tile
// and NONE of them lands on a room rect — and a room rect is exactly where `orderSuppressionToast`
// used to replace the erase line with "ERASE ARMED — ESC TO DISARM", putting the miss back into
// silence on the tiles that matter most. The measured ship-fact that made this rig honest is what
// hid the defect from it. The fix is to point the instrument at what it could no longer see: STRIP
// is on this bar too and every device is inside a room, so a strip order is an in-room designation
// the Overview can both paint and take back.
{
  const ovStripBtn = await centre('[data-ov-tool="strip"]');
  const dev0 = strippable[0];
  if (ovStripBtn && ovEraseBtn && dev0) {
    log('\n=== OVERVIEW, INSIDE A ROOM: strip a device, erase it, and miss beside it ===');
    const p = ovScreenOf(dev0.x, dev0.y);
    const before = count('strip', room);
    await clickAt(ovStripBtn.x, ovStripBtn.y); await sleep(700);
    await clickAt(p.x, p.y);
    await sleep(1700);
    const landed = check(count('strip', room) === before + 1,
      `a STRIP landed on the in-room device at ${dev0.x},${dev0.y} from the OVERVIEW (${before} -> ${count('strip', room)})`);
    check(!(await evaluate(`document.body.classList.contains('roomzoom-open')`)),
      'the armed order OWNED the click — the room did not open under it');
    await clickAt(ovStripBtn.x, ovStripBtn.y); await sleep(600);
    await clickAt(ovEraseBtn.x, ovEraseBtn.y); await sleep(700);
    if (landed) {
      await clickAt(p.x, p.y);
      await sleep(1700);
      const hitLine = await toast('ov-toast');
      log('  IN-ROOM erase TOAST:', JSON.stringify(hitLine));
      await toastCrop('08-overview-inroom-erase-toast.png', 'ov-toast');
      check(count('strip', room) === before, `the in-room STRIP was taken back (-> ${count('strip', room)})`);
      check(/ERASED STRIP/.test(hitLine) && !/HIDDEN/.test(hitLine),
        'the IN-ROOM erase says what it took back, visibly (R1: this line used to be replaced by '
        + '"ERASE ARMED — ESC TO DISARM")');
      check(/ESC TO DISARM/.test(hitLine),
        '…and the refusal is APPENDED, not dropped — one toast carries both facts');
      // …and the MISS on the same room rect, which is the case that went silent.
      await clickAt(p.x, p.y);
      await sleep(1600);
      const missLine = await toast('ov-toast');
      log('  IN-ROOM miss TOAST:', JSON.stringify(missLine));
      await toastCrop('09-overview-inroom-nothing-to-erase.png', 'ov-toast');
      check(/NOTHING TO ERASE/.test(missLine) && !/HIDDEN/.test(missLine),
        'THE R1 CASE: the erase MISS survives inside a room. A correct erase on a bare tile sends '
        + 'nothing, and until this fix suppression replaced that line with the ARMED refusal — which '
        + 'made a correct no-op indistinguishable from a broken tool on exactly the tiles that '
        + 'matter, since every device a player wants to un-condemn is inside a room');
      await png('10-overview-inroom-erase.png');
    }
    await clickAt(ovEraseBtn.x, ovEraseBtn.y); await sleep(600);
  } else check(false, 'the in-room Overview leg could not run (no strip button or no device)');
}

// ───────────────────────────────────────────────────────────── 4. THE ROOM ZOOM
log('\n=== ROOM ZOOM ===');
const rc = await centre(`.pl-room[data-anchor="${room.anchor}"]`);
if (!rc) { console.error(`FAIL: .pl-room[data-anchor="${room.anchor}"] is not in the Overview DOM`); process.exit(7); }
await clickAt(rc.x, rc.y);
await sleep(3000);

// THE PALETTE FIRST — a 17th tool changes its layout, and it has clipped before (with the scrollbar
// deliberately hidden, so three verbs were unreachable AND unadvertised). Checked at the LAPTOP
// viewport, per button, for containment inside the palette's own box.
const palBox = await evalJson(`(()=>{const e=document.getElementById('rz-palette');const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),scrollW:e.scrollWidth,clientW:e.clientWidth};})()`);
log('  palette box:', JSON.stringify(palBox));
const clipped = await evalJson(`(()=>{const p=document.getElementById('rz-palette');const pr=p.getBoundingClientRect();const out=[];for(const b of p.querySelectorAll('.rz-tool')){const r=b.getBoundingClientRect();if(r.right>pr.right+0.5||r.left<pr.left-0.5||r.bottom>pr.bottom+0.5||r.top<pr.top-0.5||r.width===0)out.push(b.dataset.rztool);}return out;})()`);
check(Array.isArray(clipped) && clipped.length === 0, `every palette button is inside the palette box (clipped: ${JSON.stringify(clipped)})`);
check((await evaluate(`document.querySelectorAll('#rz-palette .rz-tool').length`)) === 17, 'the palette paints 17 tools');
check(!!(await centre('[data-rztool="erase"]')), 'the palette carries an ERASE button');
const palCrop = await evalJson(`(()=>{const e=document.getElementById('rz-palette');const r=e.getBoundingClientRect();const pad=8;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})()`);
if (palCrop) await png('20-palette-17-tools.png', palCrop);

const L = await evalJson(`(()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();const vb=e.getAttribute('viewBox').split(' ').map(Number);return {x:r.x,y:r.y,w:r.width,h:r.height,vw:vb[2],vh:vb[3]};})()`);
const U = 32;
const rs = Math.min(L.w / L.vw, L.h / L.vh);
const rOffX = L.x + (L.w - L.vw * rs) / 2, rOffY = L.y + (L.h - L.vh * rs) / 2;
const screenOf = (tx, ty) => ({ x: rOffX + ((tx - room.x) * U + U / 2) * rs, y: rOffY + ((ty - room.y) * U + U / 2) * rs });
const armTool = async (tool) => {
  const b = await centre(`[data-rztool="${tool}"]`);
  if (!b) { console.error(`FAIL: no ${tool} button on the palette — the verb is unreachable`); process.exit(9); }
  await clickAt(b.x, b.y); await sleep(900);
};

// ── STRIP a real (non-door) device, then ERASE it ──
log('\n--- STRIP a device, then ERASE ---');
const dev = strippable[0];
const stripBefore = count('strip', room);
await armTool('strip');
{
  const p = screenOf(dev.x, dev.y);
  await dragFrom(p, p);
  await sleep(1800);
  const stripped = count('strip', room);
  const landed = check(stripped > stripBefore, `a STRIP order landed on the kind-${dev.kind} device at ${dev.x},${dev.y} (${stripBefore} -> ${stripped})`);
  await png('21-strip-mark.png');
  await armTool('strip');       // disarm
  await armTool('erase');
  await png('22-erase-armed.png');
  if (landed) {
    await clickAt(p.x, p.y);
    await sleep(1800);
    const tl = await toast('rz-toast');
    log('  TOAST:', JSON.stringify(tl));
    await toastCrop('23-erase-strip-toast.png', 'rz-toast');
    check(count('strip', room) === stripBefore, `ERASE took the STRIP order back (${stripped} -> ${count('strip', room)})`);
    check(/TAKEN BACK/.test(tl) && !/HIDDEN/.test(tl), 'the Room Zoom said the order was TAKEN BACK, visibly');
    await png('24-erase-strip-done.png');
    // the MISS
    await clickAt(p.x, p.y);
    await sleep(1500);
    const miss = await toast('rz-toast');
    log('  TOAST on an already-clear tile:', JSON.stringify(miss));
    check(/NOTHING TO ERASE/.test(miss) && !/HIDDEN/.test(miss), 'an erase that cleared nothing says so, visibly');
    await toastCrop('25-nothing-to-erase.png', 'rz-toast');
  }
  await armTool('erase');       // disarm
}

// ── STOCKPILE: a DRAG paints a rectangle, a DRAG takes it back. The verb whose PAINT is two
// commands per tile and whose ERASE is deliberately one. ──
log('\n--- STOCKPILE a 3x3, then ERASE the region with a DRAG ---');
{
  // The 3x3 with the FEWEST devices on it. It does not have to be clear: `IsFreeStockpileTile` is
  // "Stockpile + Walkable + empty", so the sim silently refuses the occupied tiles and zones the
  // rest — which is why the check below measures HOW MANY actually zoned rather than assuming nine.
  // (The first draft insisted on a clear 3x3 and failed on `cryobay`, which is twelve cryo capsules
  // in a 12x8 room. That was the rig being wrong about the ship, not the ship being wrong.)
  const occupied = new Set(devices.filter((d) => inRect(d, room)).map((d) => d.x + ',' + d.y));
  let origin = null, bestFree = -1;
  for (let y = room.y; y <= room.y + room.h - 3; y++) {
    for (let x = room.x; x <= room.x + room.w - 3; x++) {
      let free = 0;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (!occupied.has((x + dx) + ',' + (y + dy))) free++;
      if (free > bestFree) { bestFree = free; origin = { x, y }; }
    }
  }
  {
    log(`  3x3 at ${origin.x},${origin.y} — ${bestFree}/9 tiles carry no device`);
    const zBefore = count('stockpile', room);
    await armTool('stockpile');
    await dragFrom(screenOf(origin.x, origin.y), screenOf(origin.x + 2, origin.y + 2));
    await sleep(2200);
    const zoned = count('stockpile', room);
    const landed = check(zoned > zBefore, `a 3x3 STOCKPILE drag zoned ${zoned - zBefore} tile(s) (${zBefore} -> ${zoned})`);
    if (landed) check(zoned - zBefore > 1, `the drag SWEPT a region rather than one tile (${zoned - zBefore} tiles zoned)`);
    await png('26-stockpile-zone.png');
    await armTool('stockpile');
    await armTool('erase');
    if (landed) {
      await dragFrom(screenOf(origin.x, origin.y), screenOf(origin.x + 2, origin.y + 2));
      await sleep(2200);
      const tl = await toast('rz-toast');
      log('  TOAST:', JSON.stringify(tl));
      await toastCrop('27-erase-zone-toast.png', 'rz-toast');
      check(count('stockpile', room) === zBefore, `an ERASE DRAG took the whole zone back (${zoned} -> ${count('stockpile', room)})`);
      check(/ORDERS? TAKEN BACK/.test(tl), 'the toast reported the ORDERS cleared, not the tiles dragged over');
      await png('28-erase-zone-done.png');
    }
    await armTool('erase');
  }
}

try { cdp.close(); ws.close(); } catch { /**/ }
chrome.kill('SIGKILL');
rmSync(userDir, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} CHECK(S) FAILED — the verb does not work in the running game`); process.exit(1); }
log('\nOK — every check passed against the live sim');
process.exit(0);
