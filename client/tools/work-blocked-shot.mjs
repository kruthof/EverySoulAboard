#!/usr/bin/env node
// work-blocked-shot.mjs — THE M2-18 ACCEPTANCE DEMO, DRIVEN ON THE SHIPPING GAME (`--ship wreck`).
//
// ⚠️ WHY THIS EXISTS, AND WHY STEP 0 IS THE POINT. OD-H boots every work type OFF, so the FIRST
// order a new player paints is refused because nobody aboard is assigned that work. Before
// `WireFormat.ReasonWorkTypeOff` the game answered with NOTHING: paint a strip order, watch it sit
// there, forever. A green suite is exactly the evidence that was already available while that
// silence was live — so the acceptance is run against a real host, in the order a player meets it.
//
//   0. a FRESH game, BEFORE the WORK tab is opened at all: paint a STRIP order
//      ⇒ the tile must carry reason 4, `nobody aboard is assigned that work`
//   1. set Deconstruct to 3 for the one thawed crew member  ⇒ the reason CLEARS and she goes
//   2. set it back to OFF and paint another order            ⇒ the reason RETURNS
//
// ⛔ NOTHING ABOUT THIS SHIP IS HARD-CODED. The strip targets are derived from the `frame` channel
// (a plain wall with an open floor 4-neighbour) and confirmed accepted by reading the `marks`
// channel back; the crew id comes off `roster`; the work-type number is PARSED from the sim's own
// `WorkType` enum and the reason code from `WireFormat.Blocked.cs`. That is the
// blocked-reach-shot.mjs rule, inherited rather than rediscovered: revision 0 of that rig
// hand-wrote a device-kind number under a comment naming a different member and published three
// false findings. A rig that derives a constant by hand is the mirror this repo refuses to create.
//
// NON-VACUITY, CHECKED BEFORE ANYTHING IS BELIEVED: the run FAILS if no strip order is accepted, if
// the crew roster is empty, or if step 0 produces no reason-4 row — a rig that censuses an empty set
// and then reports "nothing is blocked" is how a false all-clear gets published.
//
// USAGE
//   1. ./play.sh --host-port 8348 --client-port 8349 --no-open
//   2. node client/tools/work-blocked-shot.mjs [--host-port 8348]
//
// Exits non-zero on any failed step. Prints what it SAW at each one.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8348');
const DECK = +arg('deck', '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };

// ── THE TWO CONSTANTS ARE READ FROM THE SOURCE THAT OWNS THEM, NOT WRITTEN HERE ──
const HERE = dirname(fileURLToPath(import.meta.url));
const CITIZEN_CS = readFileSync(resolve(HERE, '../../sim/Sim.Core/Entities/Citizen.cs'), 'utf8');
const WIRE_CS = readFileSync(resolve(HERE, '../../hosts/web/WireFormat.Blocked.cs'), 'utf8');
// ⚠️ THE PARSE IS SCOPED TO THE `enum WorkType` BLOCK, and this is a MEASURED correction, not
// caution. `Citizen.cs` declares `Deconstruct` TWICE — `JobKind.Deconstruct = 11` at :326 and
// `WorkType.Deconstruct = 3` at :365 — and revision 0 of this rig took the first match, sent
// `work: 11` (out of range), got an empty `work` channel back and reported the badge as "surviving
// the fix". The rig accused the code of the rig's own bug. A name is not a constant; the ENUM is.
const wtBlock = /enum\s+WorkType\s*:\s*byte\s*\{([^}]*)\}/.exec(CITIZEN_CS);
if (!wtBlock) die(1, 'could not find the WorkType enum block in sim/Sim.Core/Entities/Citizen.cs');
const dec = /^\s*Deconstruct\s*=\s*(\d+)\s*,/m.exec(wtBlock[1]);
if (!dec) die(1, 'could not read WorkType.Deconstruct out of the WorkType enum — this parse has '
  + 'rotted, and a hand-written fallback is the defect this line exists to prevent');
const WORK_DECONSTRUCT = Number(dec[1]);
const rc = /public const int ReasonWorkTypeOff\s*=\s*(\d+)\s*;/.exec(WIRE_CS);
if (!rc) die(1, 'could not read WireFormat.ReasonWorkTypeOff out of hosts/web/WireFormat.Blocked.cs');
const REASON_WORK_TYPE_OFF = Number(rc[1]);
log(`0   PARSED: WorkType.Deconstruct = ${WORK_DECONSTRUCT}, ReasonWorkTypeOff = ${REASON_WORK_TYPE_OFF}`);

// ───────────────────────────────────────────────────────────── drive the sim over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

const blockedOf = (d) => (latest.get('blocked')?.cells || []).filter((c) => (c[2] | 0) === d);
const reasonAt = (d, x, y) => {
  const r = blockedOf(d).find((c) => (c[0] | 0) === x && (c[1] | 0) === y);
  return r ? (r[4] | 0) : null;
};
const census = (d) => {
  const by = {};
  for (const c of blockedOf(d)) { const k = `order${c[3]}/reason${c[4]}`; by[k] = (by[k] || 0) + 1; }
  return JSON.stringify(by);
};
const pawn = () => latest.get('roster')?.crew?.[0];

async function gotoDeck(deck) {
  for (let i = 0; i < 16; i++) {
    const cur = latest.get('frame')?.deck | 0;
    if (cur === deck) return true;
    send({ cmd: 'deck', dz: Math.sign(deck - cur) });
    await sleep(450);
  }
  return (latest.get('frame')?.deck | 0) === deck;
}
if (!await gotoDeck(DECK)) die(2, 'could not reach deck ' + DECK);
await sleep(1200);

const p0 = pawn();
if (!p0) die(3, 'the roster is EMPTY — with no crew aboard every step below would be vacuous');
log(`0   crew: cid=${p0.cid} "${p0.name}" task="${p0.task}" at (${p0.x},${p0.y}) deck ${p0.deck}`);
log(`0   blocked census BEFORE anything is painted: ${census(DECK)}`);

// ── the strip targets, DERIVED FROM THE FRAME: a plain wall with an open floor 4-neighbour ──
const F = latest.get('frame');
const W = F.w | 0, H = F.h | 0;
const ch = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : String.fromCharCode(F.cells[y * W + x][0]);
const candidates = [];
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++) {
    if (ch(x, y) !== '#') continue;
    if (ch(x - 1, y) === '.' || ch(x + 1, y) === '.' || ch(x, y - 1) === '.' || ch(x, y + 1) === '.')
      candidates.push([x, y]);
  }
if (!candidates.length) die(4, 'no interior wall with an open approach could be derived from the frame');
log(`0   ${candidates.length} candidate walls derived from the frame`);

/** Paint a strip and return the tile the sim ACCEPTED (read back off `marks`), or null. */
async function paintStrip(from) {
  for (const [x, y] of candidates.slice(from, from + 12)) {
    send({ cmd: 'strip', x, y, on: 1 });
    await sleep(700);
    if (reasonAt(DECK, x, y) !== null) return [x, y];
    const marked = (latest.get('marks')?.cells || [])
      .some((c) => (c[0] | 0) === x && (c[1] | 0) === y && (c[2] | 0) === DECK);
    if (marked) return [x, y];
  }
  return null;
}

// ═══════════════════════════════ STEP 0 — the FIRST thing a new player does, WORK tab unopened
const site = await paintStrip(0);
if (!site) die(5, 'the sim accepted no strip order at all, so step 0 has nothing to be refused');
await sleep(1500);
const r0 = reasonAt(DECK, site[0], site[1]);
log(`\nSTEP 0  strip painted at (${site[0]},${site[1]}) with the WORK tab NEVER OPENED`);
log(`STEP 0  reason on that tile = ${r0}   census: ${census(DECK)}`);
if (r0 !== REASON_WORK_TYPE_OFF)
  die(6, `the first order a new player paints reported reason ${r0}, not ${REASON_WORK_TYPE_OFF}. `
    + 'Without this the opening reads "paint an order, nothing happens, forever, silently".');
log('STEP 0  ✓ the tile SAYS SO — nobody aboard is assigned that work');

// ═══════════════════════════════ STEP 1 — open WORK, set Deconstruct to 3 ⇒ it clears and she goes
send({ cmd: 'workPriority', cid: p0.cid, work: WORK_DECONSTRUCT, priority: 3 });
await sleep(3000);
const r1 = reasonAt(DECK, site[0], site[1]);
const workRows = (latest.get('work')?.cells || []).filter((c) => (c[0] | 0) === p0.cid);
log(`\nSTEP 1  workPriority cid=${p0.cid} work=${WORK_DECONSTRUCT} priority=3`);
log(`STEP 1  the work channel now carries ${JSON.stringify(workRows)}`);
log(`STEP 1  reason on the tile = ${r1}   census: ${census(DECK)}`);
if (r1 === REASON_WORK_TYPE_OFF)
  die(7, 'the badge survived the player doing exactly what it told them to do. This reason must be a '
    + 'LIVE read of the crew, not a stamp.');
await sleep(6000);
const p1 = pawn();
log(`STEP 1  pawn task = "${p1?.task}" at (${p1?.x},${p1?.y})`);
log('STEP 1  ✓ the reason cleared');

// ═══════════════════════════════ STEP 2 — set it back OFF, paint another order ⇒ it returns
//
// ⚠️ THE CHECK IS "A REASON-4 ROW EXISTS AGAIN ON THIS DECK", NOT "THE NEW TILE CARRIES 4", and that
// is a correction made after driving it. On `--ship wreck` most of the hull is airless, so a wall
// picked blind is very likely to carry `air` (reason 0) instead — AIR OUTRANKS THIS REASON, by
// design and by the precedence leg in `BlockedChannelTests`. Requiring the new tile specifically
// would make the rig fail on the package working correctly. The claim the charter actually makes is
// that the refusal comes BACK when the switch goes back off, and step 1 left the deck at zero
// reason-4 rows, so a non-zero count here is exactly that claim.
send({ cmd: 'workPriority', cid: p0.cid, work: WORK_DECONSTRUCT, priority: 0 });
await sleep(2500);
const site2 = await paintStrip(candidates.findIndex((c) => c[0] === site[0] && c[1] === site[1]) + 1);
if (!site2) die(8, 'no SECOND strip order was accepted, so step 2 has nothing to be refused');
await sleep(2000);
const back = blockedOf(DECK).filter((c) => (c[4] | 0) === REASON_WORK_TYPE_OFF);
log(`\nSTEP 2  Deconstruct switched back OFF; second strip painted at (${site2[0]},${site2[1]})`);
log(`STEP 2  that tile reads reason ${reasonAt(DECK, site2[0], site2[1])}; `
  + `reason-4 rows on the deck = ${back.length} at ${back.map((c) => `(${c[0]},${c[1]})`).join(' ')}`);
log(`STEP 2  census: ${census(DECK)}`);
if (!back.length)
  die(9, 'no work-type-off row came back after the work type was switched off again — the reason is '
    + 'not a live read of the crew');
log('STEP 2  ✓ the reason returned\n');

log('ACCEPTANCE: all three steps observed on the shipping game.');
ws.close();
process.exit(0);
