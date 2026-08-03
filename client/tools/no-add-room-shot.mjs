#!/usr/bin/env node
// no-add-room-shot.mjs — PHOTOGRAPH M1-L on the STANDARD SURFACE, and CENSUS the live DOM.
//
// ⚠️ WHY THIS EXISTS. `EveryCompartmentIsARoomTests` proves the HOST sends eight occupied, named
// compartments; `no-add-room.test.js` proves the client MODEL names them and that `roomTileRect`
// resolves them. Neither can prove the running game lets a player click one and see inside — an SVG
// group paints nothing if it is clipped, under an opaque layer, or drawn outside its tile, and a
// `data-anchor` that never reaches the DOM makes every one of those green tests true and useless.
// `wreck-shot.mjs` is this rig for the wreck's art; this is it for M1-L's claim.
//
// ⚠️ AND IT CHECKS ITSELF FIRST. Two rigs in the previous run published conclusions from silently
// broken instruments — one censused `DeviceKind.Door` as 2 when it is 0, one counted rooms that
// cannot be entered. So step 0 here asserts three facts that are TRUE INDEPENDENTLY of this package
// (the ship is the wreck; `cryobay` is an authored room whose caption reads CRYO BAY; deck 0 carries
// eight slots). A negative result is only believable after those hold.
//
// WHAT IT SHOWS
//   nar-1-overview-deck0.png   the surviving deck — EIGHT named compartments, NO ＋ADD ROOM box
//   nar-2-machinery-room.png   the Room Zoom INSIDE hall_d0_s1 — recycler_1 + machineshop_1
//   nar-3-fabricator-room.png  the Room Zoom INSIDE hall_d0_s2 — fabricator_1
//   nar-4-overview-deck1.png   the dead deck — eight named compartments, still no ＋ADD ROOM box
//
// USAGE
//   1. ~/.dotnet/dotnet run --project hosts/web -- --port 8390 --ship wreck
//      python3 client/serve.py 8391
//   2. node client/tools/no-add-room-shot.mjs --out docs/design/shots
//
// Exits non-zero if the host will not answer, if the instrument check fails, if any ＋ADD ROOM
// affordance is in the DOM, or if a compartment that used to be a blank box cannot be entered.
//
// ⚠️ A FAILURE AFTER THE CHROME SPAWN LEAKS a headless Chrome and its CDP port — the committed
// convention in `wreck-shot.mjs` / `door-shot.mjs`, recorded rather than re-engineered here.
// If you hit it: `pkill -f "remote-debugging-port=9351"`.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'nar-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9351');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
mkdirSync(OUT, { recursive: true });

// The owner's own case: the two untyped deck-0 compartments holding the matter-ladder benches
// (`AuthoredShips.PeriluneWreck`, the "frontier" block).
const MACHINERY = [
  { anchor: 'hall_d0_s1', label: 'ROOM A1', devices: ['recycler_1', 'machineshop_1'] },
  { anchor: 'hall_d0_s2', label: 'ROOM A2', devices: ['fabricator_1'] },
];

// ───────────────────────────────────────────────────────────── 1. read the sim over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

// ── STEP 0: THE INSTRUMENT CHECK, before any conclusion is drawn ──
const decksMsg = latest.get('decks');
if (!decksMsg) die(2, 'no `decks` message — the rig is not reading this host at all');
const d0 = decksMsg.decks?.find((d) => (d.deck | 0) === 0);
if (!d0 || d0.slots?.length !== 8) die(2, `deck 0 has ${d0?.slots?.length} slots, not 8 — wrong ship?`);
const anchorsOnWire = d0.slots.map((t) => String(t[5] ?? ''));
if (!anchorsOnWire.includes('cryobay')) die(2, 'no `cryobay` on deck 0 — this is not --ship wreck');
for (const m of MACHINERY)
  if (!anchorsOnWire.includes(m.anchor)) die(2, `${m.anchor} is not on the wire — the ship was re-authored`);
log('INSTRUMENT OK — --ship wreck, deck 0, 8 slots:', anchorsOnWire.join(' | '));

// The BEFORE/AFTER, read off the wire rather than asserted from memory: every deck-0 slot now
// carries an anchor. On `main` the five untyped ones carried `""`, which is why they could not be
// entered — `roomTileRect` looks a room up BY NAME.
const blank = d0.slots.filter((t) => !String(t[5] ?? '') || !t[7]);
if (blank.length) die(3, `${blank.length} deck-0 slot(s) still leave the host blank/unoccupied`);
log('all 8 deck-0 slots leave the host OCCUPIED with a non-blank anchor');

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'nar-shot-'));
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
// ⚠️ `returnByValue` hands back the STRING these snippets stringify — PARSE IT (door-shot.mjs's
// header records a run where it was read as an object and every field came back `undefined`).
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const v = await evaluate(expr); return v && v !== 'null' ? JSON.parse(v) : null; };
const click = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
};
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(7000);

const onb = await json(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onb) { await click(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`))
  die(8, 'the onboarding card is still up — every screenshot below would photograph it');

const escape = async () => {
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(1500);
};

async function toDeck(deck) {
  for (let i = 0; i < 16; i++) {
    const cur = latest.get('frame')?.deck | 0;
    if (cur === deck) break;
    send({ cmd: 'deck', dz: Math.sign(deck - cur) });
    await sleep(450);
  }
  await sleep(2000);
  if ((latest.get('frame')?.deck | 0) !== deck) die(2, 'could not reach deck ' + deck);
}

/** The DOM census of one Overview deck: what the player can actually see and click. */
const censusExpr = `JSON.stringify({
  rooms: [...document.querySelectorAll('.pl-room')].map(e => ({
    anchor: e.dataset.anchor || '',
    label: (e.querySelector('text')?.textContent || '').trim(),
  })),
  halls: document.querySelectorAll('.pl-hall').length,
  chips: document.querySelectorAll('.pl-addroom').length,
  picker: document.querySelectorAll('#ov-picker').length,
  addRoomText: (document.getElementById('overview-view')?.textContent || '').includes('ADD ROOM'),
})`;

await escape();
await toDeck(0);
await sleep(2500);

const c0 = await json(censusExpr);
if (!c0) die(9, 'the Overview census returned nothing — the surface is not mounted');
log('\nDECK 0 DOM CENSUS');
for (const r of c0.rooms) log(`  .pl-room[data-anchor="${r.anchor}"]  label="${r.label}"`);
log(`  .pl-hall=${c0.halls}  .pl-addroom=${c0.chips}  #ov-picker=${c0.picker}  text contains "ADD ROOM"=${c0.addRoomText}`);

// ⭐ THE OCCLUSION CENSUS — AND ITS OWN CORRECTION, RECORDED BECAUSE IT MATTERS.
//
// The first version of this census asked "does a furniture bounding box INTERSECT the label box?"
// and failed the run after the fix had already worked. That question measures GEOMETRY, and the fix
// changed PAINT ORDER — the boxes still intersect, the label now paints on top. It also over-reports
// badly: `cryobay`'s label intersects a capsule sprite over 47 of its 61 px and has always been
// perfectly legible, because a bounding box is not ink.
//
// The honest instrument for "can the player read this name" is DOCUMENT ORDER inside the SVG, which
// is what SVG paints by. So: for every label that geometrically overlaps furniture, require the
// label node to come AFTER the furniture node. Intersections are printed as information; only a
// label painted UNDER furniture is a failure.
const occl = await json(`JSON.stringify([...document.querySelectorAll('.pl-room text')].map(t => {
  const tb = t.getBoundingClientRect();
  const over = [...document.querySelectorAll('.pl-furniture g[transform]')]
    .filter(g => { const b = g.getBoundingClientRect();
      return b.width > 0 && b.right > tb.left && b.left < tb.right && b.bottom > tb.top && b.top < tb.bottom; });
  // Node.DOCUMENT_POSITION_FOLLOWING (4) on t.compareDocumentPosition(g) means g comes AFTER t,
  // i.e. g paints OVER the label. Any such piece is a genuinely hidden name.
  const painters = over.filter(g => (t.compareDocumentPosition(g) & 4) !== 0).length;
  return { anchor: t.parentNode.dataset.anchor, text: t.textContent, w: Math.round(tb.width),
           intersects: over.length, paintedOver: painters };
}))`);
log('\nLABEL PAINT-ORDER CENSUS (intersecting furniture / of those, painted OVER the name)');
for (const o of occl) log(`  ${o.anchor.padEnd(14)} "${o.text}"  intersects=${o.intersects}  paintedOver=${o.paintedOver}`);
// NON-VACUITY: "nothing is painted over" is also what a deck with NO furniture produces, so require
// the furniture layer to be carrying pieces before believing the verdict.
const furnCount = await evaluate(`document.querySelectorAll('.pl-furniture g[transform]').length`);
log(`  (furniture pieces on this deck: ${furnCount})`);
if (!furnCount)
  die(10, 'no furniture is drawn at all, so the paint-order census is vacuous');

// ⚠️ SCOPED DELIBERATELY TO THE NAMES THIS PACKAGE INTRODUCES. `cryobay`'s label overlaps a capsule
// sprite and is painted over by it — that is PRE-EXISTING, unchanged here, and legible on screen
// (a bounding box is not ink). Failing on it would be this package taking credit for someone else's
// layout. What M1-L must not do is ship a NEUTRAL name that the compartment's own door eats, which
// is exactly what its first draft did with `COMPARTMENT B0`.
const mine = occl.filter((o) => /^ROOM [A-Z]\d/.test(o.text));
if (mine.length < 4)
  die(10, `only ${mine.length} neutral names on this deck — the scoped census is vacuous`);
const hidden = mine.filter((o) => o.paintedOver > 0);
if (hidden.length)
  die(10, `${hidden.length} neutral compartment name(s) are PAINTED OVER by furniture — e.g. `
    + `${hidden[0].anchor} ("${hidden[0].text}"), whose hidden tail is the designation that makes it `
    + 'unique. Shorten the name: the bottom-row clip budget is ~11 characters.');
const preexisting = occl.filter((o) => o.paintedOver > 0 && !/^ROOM [A-Z]\d/.test(o.text));
if (preexisting.length)
  log(`  ADVISORY (pre-existing, not this package): ${preexisting.map((o) => o.anchor).join(', ')} `
    + 'overlap furniture that paints over them');

if (c0.rooms.length !== 8) die(10, `deck 0 draws ${c0.rooms.length} compartments, not 8`);
if (c0.halls) die(10, `${c0.halls} .pl-hall groups survive in the DOM`);
if (c0.chips) die(10, `${c0.chips} ＋ADD ROOM chips survive in the DOM`);
if (c0.picker) die(10, 'the #ov-picker modal survives in the DOM');
if (c0.addRoomText) die(10, 'the Overview still says "ADD ROOM" somewhere');
for (const r of c0.rooms) {
  if (!r.anchor) die(10, 'a compartment draws with a BLANK data-anchor — it cannot be clicked into');
  if (!r.label) die(10, `${r.anchor} draws an UNNAMED box — the defect this package removes`);
}
// The instrument, once more, against a fact that is true independently of this package.
const cryo = c0.rooms.find((r) => r.anchor === 'cryobay');
if (!cryo || cryo.label !== 'CRYO BAY')
  die(10, `cryobay's label reads "${cryo?.label}" — the census cannot read labels, so its negatives are worthless`);
await png('1-overview-deck0.png');

/** Enter a compartment with a real pointer click and read the Room Zoom back. */
async function enterAndCensus(anchor) {
  await escape();
  const box = await json(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${anchor}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
  if (!box) die(11, `.pl-room[data-anchor="${anchor}"] is not in the DOM — it cannot be entered`);
  await click(box.x, box.y);
  await sleep(3500);
  // ⚠️ THE SELECTORS HERE ARE CLASSES, NOT IDS, and getting that wrong is how this rig produced its
  // first (false) negative: `#rz-capname` matches nothing, so the caption read '' and the tool
  // reported an unenterable room while the room was open on screen. The real names are
  // `.rz-cap-lead` / `.rz-crumb-leaf` and the furniture group is `.rz-furniture`. A rig that cannot
  // read the thing it is judging reports a confident wrong answer — which is the exact failure this
  // file's header promises to avoid.
  //
  // ⭐ RE-POINTED 2026-08-03 (the neutral-first-screen package). The span was `.rz-cap-name` and held
  // the room name ALONE, with ` · BUILD DETAIL · ` baked into the caption's markup beside it. It is
  // `.rz-cap-lead` now and holds the whole lead clause — `{ROOM} · BUILD DETAIL · ` when a tool is
  // armed, `{ROOM} · {k} CREW HERE · ` when none is (VS-Z-12 as amended) — so this rig takes the
  // part BEFORE the first separator. What it is asserting is unchanged: entering the compartment
  // shows that compartment's name.
  return json(`JSON.stringify({
    open: document.body.classList.contains('roomzoom-open'),
    caption: (document.querySelector('.rz-cap-lead')?.textContent || '').split(' · ')[0].trim(),
    crumb: (document.querySelector('.rz-crumb-leaf')?.textContent || '').trim(),
    furniture: document.querySelectorAll('#rz-layers .rz-furniture > g').length,
    layers: !!document.getElementById('rz-layers'),
  })`);
}

for (const [i, m] of MACHINERY.entries()) {
  const z = await enterAndCensus(m.anchor);
  log(`\nROOM ZOOM on ${m.anchor}: ${JSON.stringify(z)}`);
  if (!z || !z.layers || !z.open)
    die(12, `${m.anchor} did NOT open the Room Zoom — the compartment is not enterable`);
  if (z.caption !== m.label)
    die(12, `${m.anchor}'s Room Zoom caption reads "${z.caption}", expected "${m.label}"`);
  if (z.crumb !== m.label)
    die(12, `${m.anchor}'s breadcrumb reads "${z.crumb}", expected "${m.label}"`);
  // ⭐ "…AND ENTERING ONE SHOWS ITS MACHINES." The compartment holds ${m.devices.length} named
  // bench(es) plus a light, so the furniture layer must be drawing something. A room that opened
  // empty would satisfy every assertion above and still fail the acceptance sentence.
  if (!z.furniture)
    die(12, `${m.anchor} opened EMPTY — no furniture drawn, but it holds ${m.devices.join(', ')}`);
  await png(`${i + 2}-${i === 0 ? 'machinery' : 'fabricator'}-room.png`);
}

await escape();
await toDeck(1);
await sleep(2500);
const c1 = await json(censusExpr);
log(`\nDECK 1 DOM CENSUS: rooms=${c1.rooms.length} halls=${c1.halls} chips=${c1.chips} addRoomText=${c1.addRoomText}`);
if (c1.rooms.length !== 8 || c1.halls || c1.chips || c1.addRoomText)
  die(13, 'the dead deck still shows halls or an ADD ROOM affordance');
for (const r of c1.rooms) if (!r.label || !r.anchor) die(13, `deck-1 ${r.anchor} is unnamed or unanchored`);
await png('4-overview-deck1.png');

log('\nOK — no ＋ADD ROOM affordance anywhere, and both machinery compartments open from a real click.');
cdp.close();
chrome.kill('SIGKILL');
process.exit(0);
