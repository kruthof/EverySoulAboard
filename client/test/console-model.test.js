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
  isBuildTool, isOrderTool, isPaletteTool, hintLine, chronHeader,
  designsOnDeck, designGlyph, ghostState, ghostLabel, nextNudge, nudgeVisible, NUDGE_MS, moreBelow,
  terminalList, terminalLabel, escapeTarget, taskTag, watchTask, workMarkers,
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

// ---------------- E0-3 order tools: dig + stockpile (ECONOMY-PLAN §E0) ----------------

test('tool families: build kinds, order kinds and the palette union are disjoint where they must be', () => {
  for (const t of ['wall', 'door', 'cancel']) {
    assert.equal(isBuildTool(t), true, t + ' is a build tool');
    assert.equal(isOrderTool(t), false, t + ' is not an order tool');
    assert.equal(isPaletteTool(t), true);
  }
  for (const t of ['dig', 'stockpile', 'strip']) {
    // The distinction is load-bearing: an order tool must NOT be lowered to Cmd.build.
    assert.equal(isBuildTool(t), false, t + ' must not be a build tool');
    assert.equal(isOrderTool(t), true, t + ' is an order tool');
    assert.equal(isPaletteTool(t), true, t + ' lives in the BUILD tab');
  }
  // MOVE is a crew order, not a palette tool — it survives a tab switch (see the exits test).
  for (const t of ['move', null, undefined, 'nonsense']) {
    assert.equal(isBuildTool(t), false);
    assert.equal(isOrderTool(t), false);
    assert.equal(isPaletteTool(t), false);
  }
});

test('armedTool: G toggles dig, Z toggles stockpile, V toggles strip, all share the single slot', () => {
  assert.equal(nextArmedTool(null, { t: 'keyG' }), 'dig');
  assert.equal(nextArmedTool('dig', { t: 'keyG' }), null);
  assert.equal(nextArmedTool(null, { t: 'keyZ' }), 'stockpile');
  assert.equal(nextArmedTool('stockpile', { t: 'keyZ' }), null);
  // E0-5: V arms/disarms strip (V = salVage; X was already CANCEL). Same one-slot semantics.
  assert.equal(nextArmedTool(null, { t: 'keyV' }), 'strip');
  assert.equal(nextArmedTool('strip', { t: 'keyV' }), null);
  // One slot: arming any order tool replaces whatever was armed, including a sibling order tool.
  assert.equal(nextArmedTool('wall', { t: 'keyG' }), 'dig');
  assert.equal(nextArmedTool('dig', { t: 'keyZ' }), 'stockpile');
  assert.equal(nextArmedTool('stockpile', { t: 'keyG' }), 'dig');
  assert.equal(nextArmedTool('move', { t: 'keyG' }), 'dig');
  assert.equal(nextArmedTool('dig', { t: 'keyV' }), 'strip');
  assert.equal(nextArmedTool('strip', { t: 'keyG' }), 'dig');
  // B/X are unchanged by the new family: an armed order tool is not a build tool, so B arms wall,
  // and V never collides with the CANCEL key (X) it deliberately avoids.
  assert.equal(nextArmedTool('dig', { t: 'keyB' }), 'wall');
  assert.equal(nextArmedTool('stockpile', { t: 'keyX' }), 'cancel');
  assert.equal(nextArmedTool('strip', { t: 'keyX' }), 'cancel');
  // Toggling through the palette buttons works the same as the keys.
  assert.equal(nextArmedTool(null, { t: 'toggle', tool: 'strip' }), 'strip');
  assert.equal(nextArmedTool('strip', { t: 'toggle', tool: 'strip' }), null);
});

test('armedTool: order tools disarm when leaving BUILD, and always on Esc/disconnect', () => {
  for (const s of ['dig', 'stockpile']) {
    assert.equal(nextArmedTool(s, { t: 'tab', tab: 'crew' }), null, s + ' leaves with the BUILD tab');
    assert.equal(nextArmedTool(s, { t: 'tab', tab: 'build' }), s, s + ' survives staying on BUILD');
    assert.equal(nextArmedTool(s, { t: 'escape' }), null);
    assert.equal(nextArmedTool(s, { t: 'disconnect' }), null);
    // selectionLost only ever disarms MOVE — an order tool has no crew subject to lose.
    assert.equal(nextArmedTool(s, { t: 'selectionLost' }), s);
  }
});

test('Cmd.dig / Cmd.stockpile carry an EXPLICIT on-flag so a sweep is idempotent', () => {
  assert.deepEqual(Cmd.dig(7, 3), { cmd: 'dig', x: 7, y: 3, on: 1 });
  assert.deepEqual(Cmd.dig(7, 3, true), { cmd: 'dig', x: 7, y: 3, on: 1 });
  assert.deepEqual(Cmd.dig(7, 3, false), { cmd: 'dig', x: 7, y: 3, on: 0 });
  assert.deepEqual(Cmd.stockpile(0, 0), { cmd: 'stockpile', x: 0, y: 0, on: 1 });
  assert.deepEqual(Cmd.stockpile(2, 9, false), { cmd: 'stockpile', x: 2, y: 9, on: 0 });
  // E0-5 strip shares the explicit-on contract; the host infers wall vs device from the tile.
  assert.deepEqual(Cmd.strip(4, 6), { cmd: 'strip', x: 4, y: 6, on: 1 });
  assert.deepEqual(Cmd.strip(4, 6, false), { cmd: 'strip', x: 4, y: 6, on: 0 });
  assert.notEqual(Cmd.strip(1, 1).cmd, 'build');
  // They are their OWN verbs — never a build kind, which the host would route to BuildSystem.
  assert.notEqual(Cmd.dig(1, 1).cmd, 'build');
  assert.notEqual(Cmd.stockpile(1, 1).cmd, 'build');
});

// MUTATION: drop `& ACCEPT_ALL` in Cmd.filter ⇒ the last two assertions survive with -1 and 0xFFFF
// on the wire. A negative is the dangerous one: the host's JSON reader has a sign branch, and -1
// widened to a ulong host-side is EVERY bit set, which StockZoneSystem.Accepts reads as ACCEPT
// EVERYTHING — the exact inverse of the restriction the message was asking for, and silently
// permissive rather than loudly broken. The host refuses a negative outright; this keeps the client
// from ever producing one.
test('Cmd.filter carries the WHOLE mask for a tile, canonical and never negative', () => {
  assert.deepEqual(Cmd.filter(3, 4, 8), { cmd: 'filter', x: 3, y: 4, mask: 8 });
  // Accept-nothing is a real value, not a falsy omission.
  assert.deepEqual(Cmd.filter(3, 4, 0), { cmd: 'filter', x: 3, y: 4, mask: 0 });
  assert.equal(Cmd.filter(1, 1, -1).mask, 127, 'a negative can never reach the wire');
  assert.equal(Cmd.filter(1, 1, 0xFFFF).mask, 127, 'bits above the last ItemKind are dropped');
  // Its OWN verb — never the presence verb, which carries no mask at all.
  assert.notEqual(Cmd.filter(1, 1, 5).cmd, 'stockpile');
  assert.notEqual(Cmd.filter(1, 1, 5).cmd, 'build');
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
  // E0-4 WP-5: the stockpile hint NAMES its filter. This is the only place in the whole client a
  // player can read a zone's accept-set back — a filtered tile looks exactly like an unfiltered one
  // (the frame carries raw GlyphColor bytes and no wire channel carries a filter; MECHANICS §13) —
  // so it is load-bearing, not decoration.
  // MUTATION: drop the stockLabel from the stockpile branch (return the bare 'STOCKPILE ▸ CLICK
  // DECK TO ZONE · ESC EXIT') ⇒ the FOOD · PARTS assertion fails, and the player loses the only
  // readback there is.
  assert.equal(hintLine('stockpile', '', 'FOOD · PARTS'),
    'STOCKPILE ▸ CLICK DECK TO ZONE — ACCEPTS FOOD · PARTS · ESC EXIT');
  assert.equal(hintLine('stockpile'), 'STOCKPILE ▸ CLICK DECK TO ZONE — ACCEPTS ALL · ESC EXIT',
    'an absent label degrades to ALL, matching defaultStockFilter()');
  // The other order verbs still have no armed hint — this branch is stockpile-only.
  assert.equal(hintLine('dig'), null);
  assert.equal(hintLine('strip'), null);
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
  // build now carries a material byte (0 = default; ignored host-side for door/cancel).
  assert.deepEqual(Cmd.build('wall', 3, 4), { cmd: 'build', kind: 'wall', x: 3, y: 4, material: 0 });
  assert.deepEqual(Cmd.build('wall', 3, 4, 2), { cmd: 'build', kind: 'wall', x: 3, y: 4, material: 2 });
  assert.deepEqual(Cmd.build('floor', 1, 1, 5), { cmd: 'build', kind: 'floor', x: 1, y: 1, material: 5 });
  assert.deepEqual(Cmd.build('door', 0, 0), { cmd: 'build', kind: 'door', x: 0, y: 0, material: 0 });
  assert.deepEqual(Cmd.build('cancel', 9, 9), { cmd: 'build', kind: 'cancel', x: 9, y: 9, material: 0 });
  assert.deepEqual(Cmd.chron(), { type: 'chron' });
  assert.deepEqual(Cmd.bio(7), { type: 'bio', cid: 7 }); // B3: re-request the citizen card
});

test('Cmd.addRoom marshals the exact host shape (GameSession addroom: deck/slot/type)', () => {
  assert.deepEqual(Cmd.addRoom(1, 3, 'medbay'), { cmd: 'addroom', deck: 1, slot: 3, type: 'medbay' });
  assert.deepEqual(Cmd.addRoom(0, 7, 'quarters'), { cmd: 'addroom', deck: 0, slot: 7, type: 'quarters' });
});

// ---------------- build ghosts: designsOnDeck / designGlyph ----------------

test('designsOnDeck: filters to the deck, maps [x,y,deck,kind,delivered,required], tolerant', () => {
  const cells = [[3, 4, 0, 0, 0, 2], [5, 6, 1, 1, 1, 2], [7, 8, 0, 1, 2, 2], 'garbage', [1], null];
  assert.deepEqual(designsOnDeck(cells, 0), [
    { x: 3, y: 4, kind: 0, delivered: 0, required: 2, state: 'starved' },
    { x: 7, y: 8, kind: 1, delivered: 2, required: 2, state: 'ready' },
  ]);
  assert.deepEqual(designsOnDeck(cells, 1), [{ x: 5, y: 6, kind: 1, delivered: 1, required: 2, state: 'supplied' }]);
  assert.deepEqual(designsOnDeck(cells, 2), []);
  assert.deepEqual(designsOnDeck(null, 0), []);
  assert.deepEqual(designsOnDeck(undefined, 0), []);
});

test('designsOnDeck: the ledger is APPEND-ONLY — a legacy 4-element tuple still decodes', () => {
  // The host may only ever append to the designs tuple (WireFormat is a spine file). A reader
  // handed the pre-ledger shape must keep working, with no ledger and no starved state.
  assert.deepEqual(designsOnDeck([[3, 4, 0, 0]], 0),
    [{ x: 3, y: 4, kind: 0, delivered: 0, required: 0, state: 'plain' }]);
  assert.equal(ghostLabel({ delivered: 0, required: 0 }), '', 'no ledger ⇒ no n/m label');
  // Garbage in the ledger slots degrades to "no ledger", never NaN on screen.
  assert.deepEqual(designsOnDeck([[3, 4, 0, 0, 'x', null]], 0),
    [{ x: 3, y: 4, kind: 0, delivered: 0, required: 0, state: 'plain' }]);
});

test('ghostState / ghostLabel: starved vs supplied vs ready', () => {
  assert.equal(ghostState(0, 2), 'starved', 'nothing delivered — this order is going nowhere');
  assert.equal(ghostState(1, 2), 'supplied');
  assert.equal(ghostState(2, 2), 'ready');
  assert.equal(ghostState(3, 2), 'ready', 'over-delivery still reads ready');
  assert.equal(ghostState(0, 0), 'plain');
  assert.equal(ghostLabel({ delivered: 0, required: 2 }), '0/2');
  assert.equal(ghostLabel({ delivered: 1, required: 2 }), '1/2');
  assert.equal(ghostLabel(null), '');
});

test('designGlyph: wall/door/unknown', () => {
  assert.equal(designGlyph(0), '▚');
  assert.equal(designGlyph(1), '▯');
  assert.equal(designGlyph(9), '?');
});

// ---------------- work markers + CREW WATCH task cell ----------------

test('taskTag: every host verb maps to a tag; the job-less states map to none', () => {
  // These verbs are pinned host-side by WebTaskLabelTests.Every_JobKind_Label_Opens_With_A_Known_Verb.
  assert.equal(taskTag('Digging out 12,5'), 'DIG');
  assert.equal(taskTag('Fetching regolith at 4,4'), 'HAUL');
  assert.equal(taskTag('Hauling regolith to 9,2'), 'HAUL');
  assert.equal(taskTag('Hauling regolith to wall 3,4 (0/2)'), 'HAUL');
  assert.equal(taskTag('Building wall 3,4'), 'BUILD');
  assert.equal(taskTag('Stripping the wall at 3,4'), 'STRIP'); // E0-5 deconstruct
  assert.equal(taskTag('Stripping scrubber_ls 3,4'), 'STRIP'); // E0-5 WP-2: device strip, same verb
  assert.equal(taskTag('Servicing scrubber_ls'), 'SVC');
  assert.equal(taskTag('Crafting at fab_main'), 'CRAFT');
  assert.equal(taskTag('Eating'), 'MEAL');
  assert.equal(taskTag('Drinking at tank_ls'), 'WATER');

  // Doing nothing must never be tagged as work — that was the whole defect.
  assert.equal(taskTag('Walking to 7,11 (no task)'), null);
  assert.equal(taskTag('Holding position'), null);
  assert.equal(taskTag('Idle'), null);
  assert.equal(taskTag(''), null);
  assert.equal(taskTag(null), null);
  assert.equal(taskTag(42), null);
  assert.equal(taskTag('  servicing  scrubber_ls '), 'SVC', 'tolerant of stray whitespace/casing');

  // En route: the crew member HAS a job but is still walking to it, so no map tag floats over the
  // pawn. "Claimed to be fixing X while doing nothing visible" is the defect these markers answer.
  assert.equal(taskTag('Heading to service scrubber_ls'), null);
  assert.equal(taskTag('Heading to dig out 12,5'), null);
  assert.equal(taskTag('Heading to build wall 3,4'), null);
  assert.equal(taskTag('Heading to strip the wall at 3,4'), null);
  assert.equal(taskTag('Heading to strip scrubber_ls 3,4'), null); // E0-5 WP-2
});

test('watchTask: the CREW WATCH cell shows the label and flags real work', () => {
  assert.deepEqual(watchTask({ task: 'Servicing scrubber_ls' }), { text: 'Servicing scrubber_ls', working: true });
  assert.deepEqual(watchTask({ task: 'Idle' }), { text: 'Idle', working: false });
  // En route gets no MAP tag, but CREW WATCH still reads it as assigned work: they are walking
  // to a real job, which is not the same as standing around.
  assert.deepEqual(watchTask({ task: 'Heading to service scrubber_ls' }),
    { text: 'Heading to service scrubber_ls', working: true });
  assert.deepEqual(watchTask({ task: '   ' }), { text: '—', working: false });
  assert.deepEqual(watchTask({}), { text: '—', working: false });
  assert.deepEqual(watchTask(null), { text: '—', working: false });
});

test('workMarkers: only working crew, only the shown deck, joined from the roster', () => {
  const crew = [
    { cid: 1, deck: 0, x: 3, y: 4, task: 'Servicing scrubber_ls' },
    { cid: 2, deck: 0, x: 5, y: 5, task: 'Idle' },                    // no job → no marker
    { cid: 3, deck: 0, x: 6, y: 1, task: 'Walking to 7,11 (no task)' }, // walking is not working
    { cid: 6, deck: 0, x: 7, y: 7, task: 'Heading to service pump_2' }, // en route: no tag yet
    { cid: 4, deck: 1, x: 2, y: 2, task: 'Digging out 2,2' },         // other deck
    { cid: 5, deck: 0, x: 9, y: 9, task: 'Hauling regolith to 9,2' },
  ];
  assert.deepEqual(workMarkers(crew, 0), [
    { cid: 1, x: 3, y: 4, tag: 'SVC', task: 'Servicing scrubber_ls' },
    { cid: 5, x: 9, y: 9, tag: 'HAUL', task: 'Hauling regolith to 9,2' },
  ]);
  assert.deepEqual(workMarkers(crew, 1), [{ cid: 4, x: 2, y: 2, tag: 'DIG', task: 'Digging out 2,2' }]);
  assert.deepEqual(workMarkers(crew, 2), []);
  assert.deepEqual(workMarkers(null, 0), []);
  assert.deepEqual(workMarkers([null, {}, { deck: 0, task: 'Digging out 1,1' }], 0), [],
    'an entry without finite coordinates is skipped, never rendered at NaN');
});

// ---------------- paused-ship nudge ----------------

test('nextNudge: fires only while paused, dismisses on unpause, honors the window', () => {
  let s = { shownAt: null };
  s = nextNudge(s, { t: 'trigger', paused: false }, 1000); // running → no nudge
  assert.equal(s.shownAt, null);
  assert.equal(nudgeVisible(s, 1000), false);

  s = nextNudge(s, { t: 'trigger', paused: true }, 2000);  // paused → nudge starts
  assert.equal(s.shownAt, 2000);
  assert.equal(nudgeVisible(s, 2000), true);
  assert.equal(nudgeVisible(s, 2000 + NUDGE_MS - 1), true);
  assert.equal(nudgeVisible(s, 2000 + NUDGE_MS), false);   // expired by the window edge

  s = nextNudge(s, { t: 'unpause' }, 2500);                // resuming clears immediately
  assert.equal(s.shownAt, null);
  assert.equal(nudgeVisible(s, 2500), false);

  // unknown/missing events are inert
  assert.equal(nextNudge({ shownAt: 7 }, null, 0).shownAt, 7);
  assert.equal(nextNudge(null, { t: 'noop' }, 0).shownAt, null);
});

// ---------------- CREW-tab "▾ N MORE" (moreBelow) ----------------

test('moreBelow: rows below the fold from scroll metrics; zero at bottom/degenerate', () => {
  assert.equal(moreBelow(0, 100, 300, 25), 8);   // 200px below / 25 stride
  assert.equal(moreBelow(100, 100, 300, 25), 4); // scrolled halfway
  assert.equal(moreBelow(200, 100, 300, 25), 0); // fully scrolled
  assert.equal(moreBelow(0, 300, 300, 25), 0);   // nothing overflows
  assert.equal(moreBelow(0, 100, 300, 0), 0);    // no stride → guard
  assert.equal(moreBelow(0, 100, 101, 25), 0);   // ≤1px overhang → not "1 MORE"
});

// ---------------- MOSS terminal directory ----------------

test('terminalList / terminalLabel: parse [tid,deck,x,y], drop garbage, label', () => {
  const msg = { type: 'terminals', list: [['bridge', 0, 3, 4], ['aft', 1, 9, 2], [null, 0, 0, 0], ['', 0, 0, 0], [1]] };
  const got = terminalList(msg);
  assert.deepEqual(got, [{ tid: 'bridge', deck: 0, x: 3, y: 4 }, { tid: 'aft', deck: 1, x: 9, y: 2 }]);
  assert.equal(terminalLabel(got[0]), 'bridge · DECK 0');
  assert.equal(terminalLabel(got[1]), 'aft · DECK 1');
  assert.deepEqual(terminalList(null), []);
  assert.deepEqual(terminalList({ list: 'nope' }), []);
});

// ---------------- Escape priority stack (IX-13 + IX-R10 + moss-terminal IX-M2) ----------------

test('escapeTarget: armed → dialogue → dossier → MOSS → relations → none, strict priority', () => {
  assert.equal(escapeTarget({ armed: true, dialogueOpen: true, dossierOpen: true, mossActive: true, relationsActive: true }), 'disarm');
  assert.equal(escapeTarget({ armed: false, dialogueOpen: true, dossierOpen: true, mossActive: true, relationsActive: true }), 'dialogue');
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, dossierOpen: true, mossActive: true, relationsActive: true }), 'dossier');
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, dossierOpen: false, mossActive: true, relationsActive: true }), 'moss');
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, dossierOpen: false, mossActive: false, relationsActive: true }), 'relations');
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, dossierOpen: false, mossActive: false, relationsActive: false }), 'none');
  assert.equal(escapeTarget(null), 'none');
  // the dossier rung sits ABOVE full-screen navigators: an open BIO card closes before MOSS/relations
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, dossierOpen: true, mossActive: false, relationsActive: false }), 'dossier');
  // both new rungs are ADDITIVE: a caller that never mentions them keeps the pre-existing behaviour
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, relationsActive: true }), 'relations');
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, relationsActive: false }), 'none');
});
