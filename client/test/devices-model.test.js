// THE `devices` CHANNEL — the client half.
//
// WHAT THIS FILE OWNS, in order of how badly it bites:
//   1. THE TUPLE CONTRACT. `[x, y, deck, kind, cond, oper]` is positional and there is NO COMPILER
//      across this seam. A host that swapped two elements would put every device on the wrong tile or
//      report a condition as a kind. The order is PARSED out of `hosts/web/WireFormat.Devices.cs` —
//      both from the `DeviceCell` constructor and from the emitter's own append chain — and compared
//      against what `decodeDevices` actually reads, driven.
//   2. THE NAME COLLISION. `{type:'device'}` (SINGULAR) already exists: it is the one-shot reply that
//      opens a MOSS terminal. `devices` (PLURAL) is this channel. Both `case`s must be present in
//      main.js and they must dispatch to DIFFERENT handlers — a lane that "tidied" one into the other
//      would silently delete either the terminal or the whole wear layer.
//   3. THE DECODER'S TOLERANCE, including the divergence it inherits from `decodeItems` and not from
//      `decodeMarks`: a kind this client does not know is KEPT, not dropped.
//   4. `roomDeviceConditions` — the per-tile fold, whose three rejection legs (deck, x-range,
//      y-range) are each run with the others BLINDED and required to fire ALONE. `assert` throws, so
//      a multi-leg test reports only its first failing leg and a leg that cannot bite is
//      indistinguishable from one that can (CLAUDE.md, the fifth trap shape).
//   5. THAT THE ROOM ZOOM DERIVES IT and that nothing draws it yet — which is this package's
//      deliberate scope boundary, so it is pinned rather than left to a comment.
//
// EVERY SOURCE SCAN HERE READS CODE, NOT PROSE — `codeOnly` is IMPORTED from the shared
// `client/test/code-only.js` (CLAUDE.md traps §1). Both directions are controlled at the bottom of
// this file: comments must not trip the scans, and real code must.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDevices } from '../src/wire/messages.js';
import { roomDeviceConditions } from '../src/ui/room-model.js';
import { codeOnly } from './code-only.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

const WIRE_DEVICES_CS = codeOnly(read(join(REPO, 'hosts/web/WireFormat.Devices.cs')));
const GAME_SESSION_CS = codeOnly(read(join(REPO, 'hosts/web/GameSession.cs')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));
const HUD = codeOnly(read(join(CLIENT, 'src/ui/hud.js')));
const ROOMZOOM = codeOnly(read(join(CLIENT, 'src/ui/roomzoom-view.js')));

/** A room rect covering tiles [4..8) × [2..5) on deck 1 — the shape `roomTileRect` produces. */
const ROOM = { deck: 1, rx: 4, ry: 2, rw: 4, rh: 3 };

/** Build a host-shaped `devices` message from `[x,y,deck,kind,cond,oper]` tuples. */
const msg = (cells) => ({ type: 'devices', cells });

// ════════════════════════════════════════════════════════════ the cross-language tuple contract

// MUTATION: swap `.Append(c.Cond…)` and `.Append(c.Oper…)` in WireFormat.Devices.cs ⇒ this fails and
// names the file. MUTATION 2: reorder the `DeviceCell` constructor parameters ⇒ same.
test('the wire tuple order is [x, y, deck, kind, cond, oper] on BOTH sides of the seam', () => {
  // (a) the emitter's own append chain, in source order.
  const emitted = [...WIRE_DEVICES_CS.matchAll(/\.Append\(c\.(\w+)\.ToString\(DeviceIc\)\)/g)].map((m) => m[1]);
  assert.deepEqual(emitted, ['X', 'Y', 'Deck', 'Kind', 'Cond', 'Oper'],
    'hosts/web/WireFormat.Devices.cs no longer appends the tuple in the order this client reads it. '
    + 'The tuple is POSITIONAL — a swap puts every device on the wrong tile or reports a condition '
    + 'as a kind — and there is no compiler across this seam.');

  // (b) the struct constructor, which is what `GameSession.BuildDevices` fills.
  const ctor = /DeviceCell\(int (\w+), int (\w+), int (\w+), int (\w+), int (\w+), int (\w+)\)/.exec(WIRE_DEVICES_CS);
  assert.ok(ctor, 'the DeviceCell constructor was not found — this parse has rotted and (a) alone '
    + 'cannot see a caller that fills the fields in the wrong order');
  assert.deepEqual(ctor.slice(1, 7), ['x', 'y', 'deck', 'kind', 'cond', 'oper']);

  // (c) …and the host really does fill it from the device's own position/kind/condition, in that
  // order. The multi-line `new` is matched with whitespace-tolerant spacing, not by exact layout.
  assert.match(GAME_SESSION_CS,
    /new WireFormat\.DeviceCell\(\s*p\.X,\s*p\.Y,\s*p\.Z,\s*\(int\)device\.Kind,\s*WireFormat\.ConditionByte\(device\.Condition\),\s*device\.IsOperational\(defs\) \? 1 : 0\)/,
    'GameSession.BuildDevices no longer fills DeviceCell from (p.X, p.Y, p.Z, device.Kind, '
    + 'ConditionByte(device.Condition), IsOperational). The two halves above pin the wire SHAPE; '
    + 'this pins what is put into it — in particular that `oper` is the SIM\'s operational test and '
    + 'not a threshold invented on either side.');

  // (d) the decoder reads the same positions. DRIVEN, not scanned.
  const [row] = decodeDevices(msg([[11, 22, 3, 4, 55, 1]]));
  assert.deepEqual(row, { x: 11, y: 22, deck: 3, kind: 4, cond: 55, oper: 1 });
});

test('the channel really is called `devices` on the host, and it is PLURAL', () => {
  assert.ok(WIRE_DEVICES_CS.includes('\\"type\\":\\"devices\\"'),
    'hosts/web/WireFormat.Devices.cs no longer emits {"type":"devices"} — `decodeDevices` gates on '
    + 'that string and main.js switches on it, so a rename silently deletes the whole layer');
});

// ⚠️ THE NEAR-MISS. `device` (singular) is the MOSS-terminal reply and has existed since P2; `devices`
// (plural) is this channel. They are one character apart and they must stay two distinct dispatches.
//
// MUTATION: delete the `case 'device':` line ⇒ this fails on the singular leg. MUTATION 2: point both
// cases at `Hud.renderDevices` ⇒ this fails on the distinctness leg. Both applied and watched red.
test('main.js dispatches BOTH `device` (the terminal reply) and `devices` (this channel)', () => {
  assert.match(MAIN, /case 'device':\s*Hud\.renderDevice\(m\);/,
    'the SINGULAR `device` dispatch is gone — that is the MOSS terminal reply, and this channel\'s '
    + 'near-identical name is exactly how it would get "tidied" away');
  assert.match(MAIN, /case 'devices':\s*Hud\.renderDevices\(m\);/,
    'the PLURAL `devices` dispatch is missing. tests/Perilune.Tests/SurfaceBoundaryTests.cs fails by '
    + 'name for a wire channel with no `case` in main.js, and the allowlist is empty.');
  assert.notEqual(
    /case 'device':\s*Hud\.(\w+)\(m\);/.exec(MAIN)[1],
    /case 'devices':\s*Hud\.(\w+)\(m\);/.exec(MAIN)[1],
    'the two cases dispatch to the SAME handler — one of the two layers is now silently dead');
});

// ════════════════════════════════════════════════════════════════════════════ the decoder

test('decodeDevices reads the tuple positionally and preserves the HOST order', () => {
  // Deliberately NOT sorted by tile or kind — a client-side sort would reorder this.
  const out = decodeDevices(msg([[7, 1, 0, 8, 255, 1], [2, 2, 0, 0, 26, 0], [7, 1, 0, 3, 128, 1]]));
  assert.deepEqual(out.map((r) => [r.x, r.y, r.deck, r.kind, r.cond, r.oper]),
    [[7, 1, 0, 8, 255, 1], [2, 2, 0, 0, 26, 0], [7, 1, 0, 3, 128, 1]],
    'the client re-ordered the channel. The host emits entity-store order — the same order '
    + 'GlyphMapper pass 4 draws in — and a client sort is a second, silently divergent authority.');
});

test('decodeDevices is tolerant: garbage in, null or a dropped row, never a throw', () => {
  assert.equal(decodeDevices(null), null);
  assert.equal(decodeDevices({ type: 'device', kind: 'terminal' }), null,
    'the SINGULAR terminal reply must not decode as this channel — they are one character apart');
  assert.equal(decodeDevices({ type: 'items', cells: [] }), null, 'the wrong channel must not decode');
  assert.equal(decodeDevices({ type: 'devices' }), null, 'no cells array → null, not a throw');
  assert.deepEqual(decodeDevices(msg([])), []);
  assert.equal(decodeDevices(msg([[1, 2, 0, 3, 4], 'nope', null, [1, 2, 0, 3, 4, 1]])).length, 1,
    'a FIVE-element row (an items tuple on the wrong channel), a string and a null must each be '
    + 'dropped, and the valid six-element row must survive');
  assert.equal(decode('{"type":"devices","cells":[[1,2,0,3,4,1]]}').type, 'devices',
    'the generic line decoder must still parse a devices payload');
});

// MUTATION: add `if (kind > 26) continue;` to decodeDevices ⇒ this fails.
test('a kind from a NEWER host is KEPT, following decodeItems and not decodeMarks', () => {
  const rows = decodeDevices(msg([[4, 2, 1, 99, 12, 0]]));
  assert.equal(rows.length, 1,
    'an unknown DeviceKind was dropped. On `marks` the kind IS the payload, so dropping is honest; '
    + 'here it is one of six facts — "something on this tile is nearly wrecked and inoperative" is '
    + 'still true and still worth drawing.');
  assert.equal(rows[0].cond, 12, 'the condition must survive an unknown kind — it is the useful part');
  assert.equal(rows[0].oper, 0);
});

// ══════════════════════════════════════════════════════════════ the per-tile fold (pure)

test('roomDeviceConditions keys by tile and carries kind, cond and oper through', () => {
  const map = roomDeviceConditions(decodeDevices(msg([
    [4, 2, 1, 8, 26, 1],
    [7, 4, 1, 13, 255, 1],
  ])), ROOM);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get('4,2'), { tx: 4, ty: 2, kind: 8, cond: 26, oper: 1 });
  assert.deepEqual(map.get('7,4'), { tx: 7, ty: 4, kind: 13, cond: 255, oper: 1 });
  assert.equal(map.get('5,5'), undefined, 'a tile with no device must be absent, not a zero row');
});

test('roomDeviceConditions is empty for a null channel or a null room, never a throw', () => {
  assert.equal(roomDeviceConditions(null, ROOM).size, 0);
  assert.equal(roomDeviceConditions([], ROOM).size, 0);
  assert.equal(roomDeviceConditions(decodeDevices(msg([[4, 2, 1, 8, 26, 1]])), null).size, 0);
});

// ⚠️ EACH REJECTION LEG RUNS ALONE, WITH THE OTHERS BLINDED. `assert` throws, so a multi-leg test
// reports only its FIRST failing leg — and a second leg that cannot bite is then indistinguishable
// from one that can (CLAUDE.md, the fifth trap shape, which shipped a dead deck filter). Each fixture
// below contains exactly ONE row, and that row is rejectable by exactly ONE of the three filters.
//
// MUTATION 1: delete the deck comparison ⇒ only the deck leg reddens.
// MUTATION 2: delete the `tx < rx || tx >= x1` half ⇒ only the two x legs redden.
// MUTATION 3: delete the `ty < ry || ty >= y1` half ⇒ only the two y legs redden.
// All three applied and watched red; see the package report.
for (const [name, tuple] of [
  ['a WRONG-DECK row', [5, 3, 0, 8, 26, 1]],
  ['a row LEFT of the rect', [3, 3, 1, 8, 26, 1]],
  ['a row RIGHT of the rect', [8, 3, 1, 8, 26, 1]],
  ['a row ABOVE the rect', [5, 1, 1, 8, 26, 1]],
  ['a row BELOW the rect', [5, 5, 1, 8, 26, 1]],
]) {
  test(`roomDeviceConditions drops ${name}, and that leg fires ALONE`, () => {
    const map = roomDeviceConditions(decodeDevices(msg([tuple])), ROOM);
    assert.equal(map.size, 0,
      `${name} survived the room filter. The fixture holds exactly one row and only one filter can `
      + 'reject it, so this failure names the filter that is dead.');
  });
}

test('CONTROL: the in-rect, on-deck neighbours of every rejected fixture ARE kept', () => {
  // Without this the five legs above are all satisfied by `return new Map()`.
  const map = roomDeviceConditions(decodeDevices(msg([
    [4, 2, 1, 8, 26, 1],   // top-left corner, inclusive
    [7, 4, 1, 8, 26, 1],   // bottom-right corner, inclusive
    [5, 3, 1, 8, 26, 1],   // interior — the on-deck twin of the wrong-deck fixture
  ])), ROOM);
  assert.equal(map.size, 3,
    'an in-rect on-deck row was rejected — the five rejection legs above would then all pass '
    + 'vacuously against a fold that keeps nothing');
});

test('one device per tile: the LAST row wins, matching GlyphMapper pass 4', () => {
  const map = roomDeviceConditions(decodeDevices(msg([
    [5, 3, 1, 8, 255, 1],
    [5, 3, 1, 13, 26, 0],
  ])), ROOM);
  assert.equal(map.size, 1, 'two rows for one tile must fold, not accumulate');
  assert.equal(map.get('5,3').kind, 13, 'the LAST row wins — pass 4 assigns rather than merges');
  assert.equal(map.get('5,3').cond, 26);
});

// ══════════════════════════════════════════════════════ the surface wiring (and its boundary)

// MUTATION: delete the `_deviceCond = roomDeviceConditions(...)` line ⇒ this fails.
test('the Room Zoom derives the wear layer once per repaint, from the channel', () => {
  assert.match(ROOMZOOM, /_deviceCond = roomDeviceConditions\(decodeDevices\(Hud\.getDevices\(\)\), _focus\);/,
    'roomzoom-view.js no longer derives the per-device wear map from the `devices` channel. It must '
    + 'read Hud.getDevices() — NOT the frame, which has never carried Device.Condition at all.');
  assert.match(ROOMZOOM, /export function deviceConditionAt\(/,
    'the `deviceConditionAt` seam is gone. It is the entry point the wrecked-art package reads, and '
    + 'it is the only reason this lane touches roomzoom-view.js at all.');
});

// ⚠️ THIS PACKAGE'S SCOPE BOUNDARY, PINNED. The wrecked-art join belongs to the parallel lane that
// owns `client/src/items/`. Drawing here would be a textual merge collision with that lane on the
// exact shape that has already broken this repo once (two lanes adding the same export, no git
// conflict, a module that will not load).
//
// This is a pin on a DECISION, not a permanent law: the lane that draws the art deletes this test in
// the same commit as it adds the layer, and that deletion is then a visible line in a diff instead of
// a silent scope change.
test('nothing draws the wear layer yet — the art join is a separate package', () => {
  assert.ok(!/body \+= \w*[Ww]ear\w*Svg\(/.test(ROOMZOOM) && !/body \+= \w*[Cc]ondition\w*Svg\(/.test(ROOMZOOM),
    'a wear/condition SVG layer has been concatenated into the Room Zoom. If that is deliberate, '
    + 'delete this test in the same commit — the boundary is a decision and its removal should be '
    + 'a line in a diff.');
});

// MUTATION: rename `getDevices` in hud.js without updating SHIP_STATE_REACH ⇒ surface-boundary.test.js
// fails on the pinned reach; rename it in BOTH ⇒ this fails.
test('hud.js caches the channel and exposes it as SHIP STATE, touching no DOM', () => {
  assert.match(HUD, /export function renderDevices\(m\) \{ _devices = m; notifyShip\(\); \}/,
    'the devices dispatch must be a pure cache write plus notifyShip — anything else makes it '
    + 'console CHROME, which does not survive the WP-9 split');
  assert.match(HUD, /export function getDevices\(\) \{ return _devices; \}/,
    'the getter the modern surfaces read is missing or has grown a body');
});

// ═════════════════════════════════════════════════════════════════ the scans' own controls

test('NEGATIVE CONTROL: the scans read code, not comments', () => {
  assert.ok(!codeOnly("// case 'devices': Hud.renderDevices(m);\nconst live = 1;").includes('renderDevices'),
    'a line comment survived codeOnly — the dispatch scan above could then be satisfied by a TODO');
  assert.ok(!codeOnly('/* export function deviceConditionAt(tx, ty) {} */ const live = 1;')
    .includes('deviceConditionAt'),
    'a block comment survived codeOnly — the seam scan could then be satisfied by commented-out code');
});

test('POSITIVE CONTROL: the same text in real code DOES trip the scans', () => {
  assert.match(codeOnly("case 'devices': Hud.renderDevices(m); break;"),
    /case 'devices':\s*Hud\.renderDevices\(m\);/,
    'codeOnly mangled real code — every scan above is then vacuous');
});

// ⚠️ THE FIXTURE MUST CONTAIN A LATER REAL COMMENT (CLAUDE.md's stripper trap). A control asserting
// "a quoted /* does not blind the stripper" whose fixture has no closing */ is VACUOUS: the naive
// `replace(/\/\*[\s\S]*?\*\//g,'')` finds no match, returns the input unchanged, and passes whether
// the stripper is correct or broken. Both legs below carry a REAL comment after the quoted marker.
test('codeOnly is string-literal aware, so a quoted marker cannot blind the scans', () => {
  const line = codeOnly('const u = "http://x//y";\n/* dead */ case \'devices\':');
  assert.ok(line.includes("case 'devices'"),
    "a quoted '//' blinded codeOnly to end of file — every scan using it then passes vacuously");
  assert.ok(!line.includes('dead'), 'and the REAL comment after it must still be stripped');

  const block = codeOnly('const s = "/*";\n/* dead */ case \'devices\':');
  assert.ok(block.includes("case 'devices'"), 'a quoted block-comment opener blinded codeOnly');
  assert.ok(!block.includes('dead'), 'and the REAL comment after it must still be stripped');
});

test('the scanned sources are non-empty', () => {
  for (const [name, src] of Object.entries({ WIRE_DEVICES_CS, GAME_SESSION_CS, MAIN, HUD, ROOMZOOM })) {
    assert.ok(src.length > 200, name + ' stripped to nothing — every scan over it is vacuous');
  }
});
