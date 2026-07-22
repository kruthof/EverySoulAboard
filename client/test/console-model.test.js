// Console view-model tests — the PURE derivations behind "The Console" skin (console-model.js):
// clock, caution heuristic (every boundary), morale color, crew-name parts, avatar hue, speed
// labels, sensor-log token split, the selection/roster join, the cross-deck pending-click
// reducer, and the armed-tool transition table. Also pins the new Cmd.build/Cmd.chron wire
// shapes. No DOM, no locale APIs — everything must be InvariantCulture-proof.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clockHHMM, cautionState, moraleColor, surnameOf, surnameFirst, crewInitials, crewHue,
  CREW_HUES, speedLabel, logLineParts, logTail, soulsLabel, selectedRosterEntry,
  crewClickTarget, beginPendingClick, resolvePendingClick, supersedePending, nextArmedTool,
  isBuildTool, hintLine, chronHeader,
} from '../src/ui/console-model.js';
import { Cmd } from '../src/wire/session.js';

// ---------------- clock (IX-81) ----------------

test('clockHHMM: zero, midday, padding, and the 23:59 clamp', () => {
  assert.equal(clockHHMM(0), '00:00');
  assert.equal(clockHHMM(0.5), '12:00');
  assert.equal(clockHHMM(0.25), '06:00');
  assert.equal(clockHHMM(0.279), '06:41');           // the mock's clock
  assert.equal(clockHHMM(1), '23:59');               // f=1 clamps into [0,1): never 24:00
  assert.equal(clockHHMM(0.9999999), '23:59');
  assert.equal(clockHHMM(1.7), '23:59');             // out-of-range clamps too
  assert.equal(clockHHMM(-0.3), '00:00');
  assert.equal(clockHHMM(undefined), '00:00');       // missing dayFrac → midnight, no throw
  assert.equal(clockHHMM(NaN), '00:00');
  // zero-padding on both fields
  assert.equal(clockHHMM(0.0429), '01:01');
});

// ---------------- caution chip (IX-84 — every boundary) ----------------

const NOMINAL = { co2ppm: 400, oxygen: 1, power: 1, structural: 1, water: 1, food: 1, heat: 1, morale: 1 };
const c = (over) => cautionState({ ...NOMINAL, ...over });

test('cautionState: idle when everything is nominal', () => {
  assert.deepEqual(c({}), { level: 'idle', label: 'NOMINAL' });
});

test('cautionState: alert boundaries (co2>=2000, oxygen/power/structural <0.33)', () => {
  assert.equal(c({ co2ppm: 2000 }).level, 'alert');
  assert.equal(c({ co2ppm: 1999 }).level, 'warn');   // below the alert rail → warn rail
  assert.equal(c({ oxygen: 0.32 }).level, 'alert');
  assert.equal(c({ oxygen: 0.33 }).level, 'warn');   // exactly 0.33 is NOT < 0.33
  assert.equal(c({ power: 0.32 }).level, 'alert');
  assert.equal(c({ power: 0.33 }).level, 'warn');
  assert.equal(c({ structural: 0.32 }).level, 'alert');
  assert.equal(c({ structural: 0.33 }).level, 'warn');
  assert.equal(c({ oxygen: 0.1 }).label, 'MASTER CAUTION');
});

test('cautionState: warn boundaries (co2>=1000, o2/pwr/struct <0.5, water/food <0.33)', () => {
  assert.deepEqual(c({ co2ppm: 1000 }), { level: 'warn', label: 'CAUTION · CO₂' });
  assert.equal(c({ co2ppm: 999 }).level, 'idle');
  assert.deepEqual(c({ oxygen: 0.49 }), { level: 'warn', label: 'CAUTION · O₂' });
  assert.equal(c({ oxygen: 0.5 }).level, 'idle');
  assert.deepEqual(c({ power: 0.49 }), { level: 'warn', label: 'CAUTION · PWR' });
  assert.equal(c({ power: 0.5 }).level, 'idle');
  assert.deepEqual(c({ structural: 0.49 }), { level: 'warn', label: 'CAUTION · STRUCT' });
  assert.equal(c({ structural: 0.5 }).level, 'idle');
  assert.deepEqual(c({ water: 0.32 }), { level: 'warn', label: 'CAUTION · H₂O' });
  assert.equal(c({ water: 0.33 }).level, 'idle');
  assert.deepEqual(c({ food: 0.32 }), { level: 'warn', label: 'CAUTION · FOOD' });
  assert.equal(c({ food: 0.33 }).level, 'idle');
});

test('cautionState: warn cause precedence is O₂ > PWR > STRUCT > CO₂ > H₂O > FOOD', () => {
  const all = { oxygen: 0.4, power: 0.4, structural: 0.4, co2ppm: 1500, water: 0.1, food: 0.1 };
  assert.equal(c(all).label, 'CAUTION · O₂');
  assert.equal(c({ ...all, oxygen: 1 }).label, 'CAUTION · PWR');
  assert.equal(c({ ...all, oxygen: 1, power: 1 }).label, 'CAUTION · STRUCT');
  assert.equal(c({ ...all, oxygen: 1, power: 1, structural: 1 }).label, 'CAUTION · CO₂');
  assert.equal(c({ ...all, oxygen: 1, power: 1, structural: 1, co2ppm: 0 }).label, 'CAUTION · H₂O');
  assert.equal(c({ ...all, oxygen: 1, power: 1, structural: 1, co2ppm: 0, water: 1 }).label, 'CAUTION · FOOD');
});

test('cautionState: never throws on garbage; missing fields read as healthy', () => {
  assert.deepEqual(cautionState({}), { level: 'idle', label: 'NOMINAL' });
  assert.deepEqual(cautionState(null), { level: 'idle', label: 'NOMINAL' });
  assert.equal(cautionState({ co2ppm: NaN, oxygen: NaN }).level, 'idle');
});

// ---------------- morale color (VS-4: 75/50 rails) ----------------

test('moraleColor thresholds: >=.75 good, >=.50 warn, else bad — boundaries exact', () => {
  assert.equal(moraleColor(1), 'var(--good)');
  assert.equal(moraleColor(0.75), 'var(--good)');
  assert.equal(moraleColor(0.749), 'var(--warn)');
  assert.equal(moraleColor(0.5), 'var(--warn)');
  assert.equal(moraleColor(0.499), 'var(--bad)');
  assert.equal(moraleColor(0), 'var(--bad)');
});

// ---------------- names (IX-47) ----------------

test('surnameOf: last whitespace token, uppercased; degenerate inputs are safe', () => {
  assert.equal(surnameOf('Dmitri Volkov'), 'VOLKOV');
  assert.equal(surnameOf('Reyes Calderon Diaz'), 'DIAZ');
  assert.equal(surnameOf('  Wren   Ashby  '), 'ASHBY');
  assert.equal(surnameOf('Mira'), 'MIRA');
  assert.equal(surnameOf(''), '');
  assert.equal(surnameOf(null), '');
});

test('surnameFirst (CREW tab): family-name-first, surname uppercased', () => {
  assert.equal(surnameFirst('Dmitri Volkov'), 'VOLKOV Dmitri');
  assert.equal(surnameFirst('Reyes Calderon Diaz'), 'DIAZ Reyes Calderon');
  assert.equal(surnameFirst('Mira'), 'MIRA');
  assert.equal(surnameFirst('  Wren   Ashby  '), 'ASHBY Wren');
  assert.equal(surnameFirst(''), '');
  assert.equal(surnameFirst(null), '');
});

test('crewInitials: first+last token letters; one token → its first two; empty → ?', () => {
  assert.equal(crewInitials('Dmitri Volkov'), 'DV');
  assert.equal(crewInitials('Reyes Calderon Diaz'), 'RD');
  assert.equal(crewInitials('Mira'), 'MI');
  assert.equal(crewInitials(''), '?');
  assert.equal(crewInitials(null), '?');
});

// ---------------- avatar hue (VS-6) ----------------

test('crewHue: stable per cid, always one of the six console hues', () => {
  assert.equal(crewHue(7), crewHue(7));
  assert.equal(crewHue('a'), crewHue('a'));
  for (const cid of [0, 1, 2, 'x', 'kort', null, undefined]) {
    assert.ok(CREW_HUES.includes(crewHue(cid)), String(cid));
  }
});

// ---------------- speed label (IX-83) ----------------

test('speedLabel: the wire map plus verbatim passthrough for unknown values', () => {
  // 'paused' deliberately unmapped: it renders verbatim (dimmed by the chip) — the pause chip
  // one control over already carries the ‖ glyph, so the speed chip must not duplicate it.
  assert.equal(speedLabel('paused'), 'paused');
  assert.equal(speedLabel('1x'), '1×');
  assert.equal(speedLabel('5x'), '5×');
  assert.equal(speedLabel('20x'), '20×');
  assert.equal(speedLabel('100x'), '100×');
  assert.equal(speedLabel('1000x'), '1000×');
  assert.equal(speedLabel('7x'), '7x');       // forward-compatible: verbatim
  assert.equal(speedLabel(undefined), '');
});

// ---------------- sensor log (IX-90) ----------------

test('logLineParts: splits the leading D-token; token-less lines pass through untinted', () => {
  assert.deepEqual(logLineParts('D212.27 co2 rising in quarters'),
    { ts: 'D212.27', rest: 'co2 rising in quarters' });
  assert.deepEqual(logLineParts('D0.00 boot'), { ts: 'D0.00', rest: 'boot' });
  assert.deepEqual(logLineParts('no token here'), { ts: null, rest: 'no token here' });
  assert.deepEqual(logLineParts('Dogs are not timestamps'), { ts: null, rest: 'Dogs are not timestamps' });
  assert.deepEqual(logLineParts(''), { ts: null, rest: '' });
  assert.deepEqual(logLineParts(null), { ts: null, rest: '' });
});

test('logTail: last n in order, tolerant of short/absent lists', () => {
  assert.deepEqual(logTail(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 5), ['c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(logTail(['a', 'b'], 5), ['a', 'b']);
  assert.deepEqual(logTail([], 5), []);
  assert.deepEqual(logTail(null, 5), []);
});

// ---------------- crew watch header ----------------

test('soulsLabel: pluralization + degenerate counts', () => {
  assert.equal(soulsLabel(0), 'CREW WATCH — 0 SOULS');
  assert.equal(soulsLabel(1), 'CREW WATCH — 1 SOUL');
  assert.equal(soulsLabel(8), 'CREW WATCH — 8 SOULS');
  assert.equal(soulsLabel(-3), 'CREW WATCH — 0 SOULS');
  assert.equal(soulsLabel(NaN), 'CREW WATCH — 0 SOULS');
});

// ---------------- selection / roster join (IX-40/41) ----------------

const FRAME = { deck: 1, w: 8, h: 8, sel: [3, 4], crew: [[3, 4, 0, 7], [5, 5, 1, 9]] };
const ROSTER = { type: 'roster', crew: [
  { cid: 7, name: 'Dmitri Volkov', deck: 1, x: 2, y: 4, morale: 0.6 },
  { cid: 9, name: 'Wren Ashby', deck: 2, x: 5, y: 5, morale: 0.8 },
] };

test('selectedRosterEntry: joins frame.sel → cid → roster entry; misses are null', () => {
  assert.equal(selectedRosterEntry(FRAME, ROSTER).cid, 7);
  assert.equal(selectedRosterEntry({ ...FRAME, sel: undefined }, ROSTER), null);   // no selection
  assert.equal(selectedRosterEntry(FRAME, { crew: [] }), null);                    // dead/missing crew
  assert.equal(selectedRosterEntry(FRAME, null), null);
  assert.equal(selectedRosterEntry(null, ROSTER), null);
  assert.equal(selectedRosterEntry(FRAME, ROSTER.crew).cid, 7);                    // bare array accepted
});

test('crewClickTarget: frame.crew is fresher than the roster snapshot; fog falls back', () => {
  // cid 7 is at (3,4) in the frame though the roster snapshot says (2,4):
  assert.deepEqual(crewClickTarget(FRAME, ROSTER.crew[0]), { x: 3, y: 4 });
  // cid absent from frame.crew (fog / other deck) → roster x/y:
  assert.deepEqual(crewClickTarget(FRAME, { cid: 99, x: 6, y: 6 }), { x: 6, y: 6 });
  assert.deepEqual(crewClickTarget(null, { cid: 7, x: 1, y: 2 }), { x: 1, y: 2 });
  // older host without the cid tuple element → fallback, never a throw:
  assert.deepEqual(crewClickTarget({ crew: [[3, 4, 0]] }, { cid: 7, x: 1, y: 2 }), { x: 1, y: 2 });
});

// ---------------- pending cross-deck click (IX-42) ----------------

test('pending click: resolves on the first frame of the target deck, using frame-fresh tiles', () => {
  const entry = { cid: 9, deck: 2, x: 5, y: 5 };
  const p = beginPendingClick(entry, 1000);
  assert.equal(p.deadline, 2000);
  // a frame from the WRONG deck keeps the pending click alive:
  const r1 = resolvePendingClick(p, { deck: 1, crew: [] }, 1100);
  assert.equal(r1.send, null);
  assert.equal(r1.next, p);
  // the target deck's frame resolves it — via frame.crew when the cid is visible:
  const r2 = resolvePendingClick(p, { deck: 2, crew: [[6, 5, 0, 9]] }, 1200);
  assert.deepEqual(r2.send, { x: 6, y: 5 });
  assert.equal(r2.next, null);
  // ... or via the stored roster x/y when fogged:
  const r3 = resolvePendingClick(p, { deck: 2, crew: [] }, 1200);
  assert.deepEqual(r3.send, { x: 5, y: 5 });
});

test('pending click: the 1000ms deadline drops it silently; null pending is a no-op', () => {
  const p = beginPendingClick({ cid: 9, deck: 2, x: 5, y: 5 }, 1000);
  const late = resolvePendingClick(p, { deck: 2, crew: [] }, 2001);
  assert.deepEqual(late, { send: null, next: null });
  assert.deepEqual(resolvePendingClick(null, { deck: 2 }, 0), { send: null, next: null });
});

test('pending click supersession (IX-42): any newer click intent or disconnect drops it', () => {
  const p = beginPendingClick({ cid: 9, deck: 2, x: 5, y: 5 }, 1000);
  // a plain/armed canvas click, another (same-deck) row click, and disconnect each supersede:
  assert.equal(supersedePending(p, { t: 'click' }), null);
  assert.equal(supersedePending(p, { t: 'row-click' }), null);
  assert.equal(supersedePending(p, { t: 'disconnect' }), null);
  // a superseded pending can no longer fire when its deck frame finally lands:
  const after = supersedePending(p, { t: 'click' });
  assert.deepEqual(resolvePendingClick(after, { deck: 2, crew: [[6, 5, 0, 9]] }, 1100),
    { send: null, next: null });
  // non-intent events keep it; null pending stays null; junk is inert:
  assert.equal(supersedePending(p, { t: 'frame' }), p);
  assert.equal(supersedePending(p, null), p);
  assert.equal(supersedePending(null, { t: 'click' }), null);
});

// ---------------- armed tool transition table (IX-2/10/13/30/52) ----------------

test('armedTool: toggle arms and re-toggle disarms; the slot is single (arming replaces)', () => {
  assert.equal(nextArmedTool(null, { t: 'toggle', tool: 'wall' }), 'wall');
  assert.equal(nextArmedTool('wall', { t: 'toggle', tool: 'wall' }), null);
  assert.equal(nextArmedTool('wall', { t: 'toggle', tool: 'door' }), 'door');      // single slot
  assert.equal(nextArmedTool('door', { t: 'toggle', tool: 'cancel' }), 'cancel');
  assert.equal(nextArmedTool('cancel', { t: 'toggle', tool: 'move' }), 'move');    // move shares it
  assert.equal(nextArmedTool('move', { t: 'toggle', tool: 'wall' }), 'wall');
});

test('armedTool: B toggles the build family, X toggles cancel (IX-10)', () => {
  assert.equal(nextArmedTool(null, { t: 'keyB' }), 'wall');
  assert.equal(nextArmedTool('wall', { t: 'keyB' }), null);
  assert.equal(nextArmedTool('door', { t: 'keyB' }), null);      // any armed build tool → disarm
  assert.equal(nextArmedTool('cancel', { t: 'keyB' }), null);
  assert.equal(nextArmedTool('move', { t: 'keyB' }), 'wall');    // move is not a build tool
  assert.equal(nextArmedTool(null, { t: 'keyX' }), 'cancel');
  assert.equal(nextArmedTool('cancel', { t: 'keyX' }), null);
  assert.equal(nextArmedTool('wall', { t: 'keyX' }), 'cancel');
});

test('armedTool: exits — Esc and disconnect always disarm; tab switch disarms build kinds only', () => {
  for (const s of ['wall', 'door', 'cancel', 'move', null]) {
    assert.equal(nextArmedTool(s, { t: 'escape' }), null);
    assert.equal(nextArmedTool(s, { t: 'disconnect' }), null);
  }
  assert.equal(nextArmedTool('wall', { t: 'tab', tab: 'crew' }), null);
  assert.equal(nextArmedTool('cancel', { t: 'tab', tab: 'chron' }), null);
  assert.equal(nextArmedTool('wall', { t: 'tab', tab: 'build' }), 'wall');   // staying on BUILD keeps it
  assert.equal(nextArmedTool('move', { t: 'tab', tab: 'crew' }), 'move');    // move survives tab switches
});

test('armedTool: selection loss disarms ONLY the move order (IX-52); junk events are inert', () => {
  assert.equal(nextArmedTool('move', { t: 'selectionLost' }), null);
  assert.equal(nextArmedTool('wall', { t: 'selectionLost' }), 'wall');
  assert.equal(nextArmedTool(null, { t: 'selectionLost' }), null);
  assert.equal(nextArmedTool('wall', null), 'wall');
  assert.equal(nextArmedTool('wall', { t: 'nonsense' }), 'wall');
  assert.equal(nextArmedTool(undefined, { t: 'escape' }), null);
});

test('isBuildTool: wall/door/cancel only', () => {
  assert.equal(isBuildTool('wall'), true);
  assert.equal(isBuildTool('door'), true);
  assert.equal(isBuildTool('cancel'), true);
  assert.equal(isBuildTool('move'), false);
  assert.equal(isBuildTool(null), false);
});

// ---------------- stage hint line (IX-37/52) ----------------

test('hintLine: per-tool content; null when idle', () => {
  assert.equal(hintLine('wall'), 'BUILD ▸ WALL — CLICK DECK TO PLACE · ESC EXIT');
  assert.equal(hintLine('door'), 'BUILD ▸ DOOR — CLICK DECK TO PLACE · ESC EXIT');
  assert.equal(hintLine('cancel'), 'CANCEL ▸ CLICK A QUEUED ORDER TO REVOKE · ESC EXIT');
  assert.equal(hintLine('move', 'VOLKOV'), 'MOVE ORDER ▸ CLICK A TILE — VOLKOV WILL WALK THERE · ESC EXIT');
  assert.equal(hintLine('move', ''), 'MOVE ORDER ▸ CLICK A TILE — CREW WILL WALK THERE · ESC EXIT');
  assert.equal(hintLine(null), null);
});

// ---------------- chronicle day header (dedupe) ----------------

test('chronHeader: strips the headline\'s own "Day n" prefix, keeps foreign/no prefixes', () => {
  assert.equal(chronHeader(0, 'Day 0 — Amara and Priya grew closer.'),
    'DAY 0 — Amara and Priya grew closer.');
  assert.equal(chronHeader(3, 'day 3: quiet shift'), 'DAY 3 — quiet shift');
  assert.equal(chronHeader(2, 'The reactor held.'), 'DAY 2 — The reactor held.');
  // a DIFFERENT day's token is content, not a prefix — never stripped:
  assert.equal(chronHeader(2, 'Day 1 — remembered'), 'DAY 2 — Day 1 — remembered');
  // "Day 10" must not be eaten by day 1 (word boundary):
  assert.equal(chronHeader(1, 'Day 10 dawns'), 'DAY 1 — Day 10 dawns');
  assert.equal(chronHeader(4, ''), 'DAY 4');
  assert.equal(chronHeader(4, 'Day 4'), 'DAY 4');
  assert.equal(chronHeader(undefined, 'x'), 'DAY 0 — x');
});

// ---------------- new wire command shapes ----------------

test('Cmd.build / Cmd.chron marshal the exact host shapes (GameSession.Parse)', () => {
  assert.deepEqual(Cmd.build('wall', 3, 4), { cmd: 'build', kind: 'wall', x: 3, y: 4 });
  assert.deepEqual(Cmd.build('door', 0, 0), { cmd: 'build', kind: 'door', x: 0, y: 0 });
  assert.deepEqual(Cmd.build('cancel', 9, 9), { cmd: 'build', kind: 'cancel', x: 9, y: 9 });
  assert.deepEqual(Cmd.chron(), { type: 'chron' });
});
