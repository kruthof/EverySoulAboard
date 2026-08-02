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
//   5. `deviceConditionAt` — THE SEAM, DRIVEN through the shipping Room Zoom controller
//      (`initRoomZoom` + `enter()` + a real repaint over dom-lite), because a scan for its SIGNATURE
//      let it be COMPLETELY INERT with the whole gate green: independent review replaced its body
//      with `return null` and with a constant tile lookup, and both read 843/843 PASS.
//   6. THAT NOTHING DRAWS IT YET — this package's deliberate scope boundary, pinned as a REFERENCE
//      COUNT over the seam's identifiers rather than as a guess at what a drawing layer would be
//      called. The first version of that pin missed four of five realistic drawing shapes.
//
// EVERY SOURCE SCAN HERE READS CODE, NOT PROSE — `codeOnly` is IMPORTED from the shared
// `client/test/code-only.js` (CLAUDE.md traps §1). Both directions are controlled at the bottom of
// this file: comments must not trip the scans, and real code must.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDecks, decodeDevices, decodeRooms } from '../src/wire/messages.js';
import { roomDeviceConditions, roomTileRect } from '../src/ui/room-model.js';
import { decksView } from '../src/ui/decks-model.js';
import { codeOnly } from './code-only.js';
import { buildItem } from '../src/items/index.js';
import { buildWrecked } from '../src/items/wrecked.js';
import { itemIdForGlyphChar } from '../src/items/glyph-map.js';
import { WRECK_COND_BYTE } from '../src/items/wear.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';

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
test('the wire tuple order is [x, y, deck, kind, cond, oper, open, serv, air] on BOTH sides of the seam', () => {
  // (a) the emitter's own append chain, in source order.
  const emitted = [...WIRE_DEVICES_CS.matchAll(/\.Append\(c\.(\w+)\.ToString\(DeviceIc\)\)/g)].map((m) => m[1]);
  assert.deepEqual(emitted, ['X', 'Y', 'Deck', 'Kind', 'Cond', 'Oper', 'Open', 'Serv', 'Air'],
    'hosts/web/WireFormat.Devices.cs no longer appends the tuple in the order this client reads it. '
    + 'The tuple is POSITIONAL — a swap puts every device on the wrong tile or reports a condition '
    + 'as a kind — and there is no compiler across this seam.');

  // (b) the struct constructor, which is what `GameSession.BuildDevices` fills.
  const ctor = /DeviceCell\(int (\w+), int (\w+), int (\w+), int (\w+), int (\w+), int (\w+), int (\w+), int (\w+), int (\w+)\)/
    .exec(WIRE_DEVICES_CS);
  assert.ok(ctor, 'the DeviceCell constructor was not found — this parse has rotted and (a) alone '
    + 'cannot see a caller that fills the fields in the wrong order');
  assert.deepEqual(ctor.slice(1, 10), ['x', 'y', 'deck', 'kind', 'cond', 'oper', 'open', 'serv', 'air']);

  // (c) …and the host really does fill it from the device's own position/kind/condition, in that
  // order. The multi-line `new` is matched with whitespace-tolerant spacing, not by exact layout.
  // ⚠️ `[\s\S]*?` between `oper` and `open` and NOT `\s*`: the OPERATE verb put a comment block
  // between those two arguments explaining why `IsOpen` is read for EVERY kind, and this source is
  // NOT comment-stripped where the emitter's is (GAME_SESSION_CS is `codeOnly`-d — it is, so the
  // lazy span crosses only whitespace today; it is written lazily so a future note there does not
  // turn a live guard into a rotted parse that `assert.ok` cannot even report).
  assert.match(GAME_SESSION_CS,
    /new WireFormat\.DeviceCell\(\s*p\.X,\s*p\.Y,\s*p\.Z,\s*\(int\)device\.Kind,\s*WireFormat\.ConditionByte\(device\.Condition\),\s*device\.IsOperational\(defs\) \? 1 : 0,[\s\S]*?device\.IsOpen \? 1 : 0,[\s\S]*?MaintenanceSystem\.IsEverServiceable\(defs, device\.Kind\) \? 1 : 0,[\s\S]*?StagingAirBit\(device\.Pos\)\)/,
    'GameSession.BuildDevices no longer fills DeviceCell from (p.X, p.Y, p.Z, device.Kind, '
    + 'ConditionByte(device.Condition), IsOperational, IsOpen). The two halves above pin the wire '
    + 'SHAPE; this pins what is put into it — in particular that `oper` is the SIM\'s operational '
    + 'test and not a threshold invented on either side, and that `open` is the device\'s own '
    + '`IsOpen` and not a kind-filtered subset of it. ⭐ M3-13: and that `serv` is asked of '
    + 'MaintenanceSystem.IsEverServiceable rather than computed here from defs.Machines[..] — a '
    + 'host-side copy of the comparison the command refuses on is how the menu and the sim drift. '
    + '\u2b50 D4: and that `air` comes from StagingAirBit, whose whole body is two calls to the '
    + 'sim\'s own MaintenanceSystem.TryFindStagingTile \u2014 a host-side re-derivation of '
    + 'breathability from room numbers is the second authority this seam exists to prevent.');

  // (d) the decoder reads the same positions. DRIVEN, not scanned.
  const [row] = decodeDevices(msg([[11, 22, 3, 4, 55, 1, 1, 0, 0]]));
  assert.deepEqual(row,
    { x: 11, y: 22, deck: 3, kind: 4, cond: 55, oper: 1, open: 1, serv: 0, air: 0 });
});

// ⚠️ THE APPEND-ONLY CONTRACT, DRIVEN. `decodeDevices` gates on `length < 6` and NOT `< 7`, so a
// six-element row from an OLDER host still decodes — with `open` defaulting to 0 (= SHUT), which is
// exactly what every surface drew before the element existed. Raising the gate to 7 would drop every
// device on the floor mid-upgrade and take the wear layer down with the state bit.
// MUTATION: change `t.length < 6` to `t.length < 7` ⇒ the first leg reddens.
test('a SIX-element row from an older host still decodes, with open defaulting to SHUT', () => {
  const [old] = decodeDevices(msg([[1, 2, 0, 0, 255, 1]]));
  assert.deepEqual(old, { x: 1, y: 2, deck: 0, kind: 0, cond: 255, oper: 1, open: 0, serv: 1, air: 1 });
  // CONTROL, so the leg above is not also satisfied by a decoder that ignores element 7 entirely.
  const [now] = decodeDevices(msg([[1, 2, 0, 0, 255, 1, 1]]));
  assert.equal(now.open, 1, 'the seventh element is being ignored — `open` is hard-wired to 0');
});

// ⭐⭐ M3-13 — THE EIGHTH ELEMENT DEFAULTS THE OTHER WAY, AND THE ASYMMETRY IS THE POINT. `open`
// absent ⇒ 0 (SHUT) and `serv` absent ⇒ 1 (serviceable), because in BOTH cases the absent value must
// reproduce the behaviour that shipped before the element existed. A `serv` defaulting to 0 would
// silently WITHDRAW the Prioritise menu from every machine on the ship the moment a row went short
// — a total loss of M2-10's verb with nothing said, on the same client that draws the badges.
// MUTATION: change the default to `(t[7] | 0)` unconditionally ⇒ leg 1 reddens (serv becomes 0).
test('a SEVEN-element row from an older host decodes with serv defaulting to SERVICEABLE', () => {
  const [old] = decodeDevices(msg([[1, 2, 0, 0, 255, 1, 1]]));
  assert.equal(old.serv, 1,
    'an absent `serv` must mean "offer the menu as before", never "this machine is never serviced"');
  // CONTROL, so the leg above is not also satisfied by a decoder that ignores element 8 entirely.
  const [now] = decodeDevices(msg([[1, 2, 0, 0, 255, 1, 1, 0]]));
  assert.equal(now.serv, 0, 'the eighth element is being ignored — `serv` is hard-wired to 1');
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

test('roomDeviceConditions keys by tile and carries kind, cond, oper, open and serv through', () => {
  const map = roomDeviceConditions(decodeDevices(msg([
    // ⭐ M3-13: `serv` differs between the two rows for exactly the reason `open` does — a model
    // that hard-wired either would pass on a fixture where both rows agree.
    [4, 2, 1, 8, 26, 1, 0, 1],
    [7, 4, 1, 13, 255, 1, 1, 0],  // `open` differs from its neighbour, so a hard-wired 0 cannot pass
  ])), ROOM);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get('4,2'),
    { tx: 4, ty: 2, kind: 8, cond: 26, oper: 1, open: 0, serv: 1, air: 1 });
  assert.deepEqual(map.get('7,4'),
    { tx: 7, ty: 4, kind: 13, cond: 255, oper: 1, open: 1, serv: 0, air: 1 });
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

// MUTATION: delete the `_deviceCond = roomDeviceConditions(...)` line ⇒ this fails. (It also reddens
// the DRIVEN seam test at the bottom of this file, which is the leg that proves the seam WORKS —
// this one only proves where it reads from.)
test('the Room Zoom derives the wear layer once per repaint, from the channel', () => {
  assert.match(ROOMZOOM, /_deviceCond = roomDeviceConditions\(decodeDevices\(Hud\.getDevices\(\)\), _focus\);/,
    'roomzoom-view.js no longer derives the per-device wear map from the `devices` channel. It must '
    + 'read Hud.getDevices() — NOT the frame, which has never carried Device.Condition at all.');
});

// ⚠️ THIS PACKAGE'S SCOPE BOUNDARY, PINNED — AND THE FIRST VERSION OF THIS PIN COULD NOT SEE FOUR OF
// FIVE REALISTIC WAYS OF BREAKING IT. It read `!/body \+= \w*[Ww]ear\w*Svg\(/`, i.e. one naming
// convention and one concatenation form. Independent review planted five drawing shapes and re-ran
// the file: `wearLayerSvg` fired, and `wreckSvg(...)`, `damagedDeviceSvg(...)`, `_deviceCond` threaded
// into the EXISTING `furnitureSvg(...)` call — the likeliest real shape, since that is where device
// art already draws — and `parts.push(...)` + `body += parts.join('')` ALL SURVIVED. That is
// CLAUDE.md's fourth trap shape: a guard whose scope filter excludes the violation. It also made this
// package's claim that "the art lane deletes this test in the same commit as it adds the layer" FALSE
// AS STATED — the boundary would have moved silently rather than as a line in a diff.
//
// INVERTED TO A POSITIVE PROPERTY. Instead of enumerating what a drawing layer might be CALLED, pin
// how many times the wear seam's four identifiers appear in the comment-stripped source. A layer that
// draws this data has to reach it somehow, and there are only four routes: the `_deviceCond` map, the
// exported `deviceConditionAt` accessor, or a re-derivation through `roomDeviceConditions` /
// `decodeDevices`. Every route moves a count. The census below is MEASURED off the shipped file, not
// computed (CLAUDE.md: re-count, never compute).
//
// This is a pin on a DECISION, not a permanent law: the lane that draws the art re-measures this
// census in the same commit as it adds the layer, and that re-measure is then a visible line in a
// diff instead of a silent scope change.
//
// ⚠️ ITS ONE KNOWN HOLE, DISCLOSED RATHER THAN LEFT TO BE FOUND: a census is a COUNT, so a change
// that REMOVES one reference and ADDS one in the same commit aliases back to the pinned numbers.
// This is not hypothetical — it was observed while mutating: with `deviceConditionAt`'s body replaced
// by `return null` (one `_deviceCond` gone) a planted `body += wearLayerSvg(_deviceCond, _focus)`
// restores the census exactly, and the seven controls below then correctly report that they cannot
// see it. The removal half is covered by the DRIVEN seam tests at the bottom of this file, which is
// the whole reason both guards exist rather than either alone. A count cannot be made
// alias-proof; a count PLUS a behavioural test of the thing being counted can.
//
// ⚠️⚠️ RE-MEASURED AT THE MERGE, AND *NEITHER* LANE'S NUMBER WAS RIGHT. Two packages landed on this
// seam on the same day — the OPERATE verb (door/vent OPEN\u21c4SHUT) and W0b (the wrecked-twin art
// join) — and each re-counted this census honestly against the tree it could see. The verb lane
// measured `_deviceCond: 4` (its fourth reference is `roomOperableTiles(_deviceCond)`); the art lane
// measured `_deviceCond: 4` (its fourth is the map handed to `furnitureSvg`, which IS the draw).
// **In the merged file it is 5**, and no arithmetic either lane could have done would have produced
// that, because neither knew the other's reference existed.
//
// \u21d2 THIS IS THE "re-count, never compute" RULE PAYING FOR ITSELF (CLAUDE.md). The two lanes'
// numbers were BOTH correct and BOTH stale, git reported no conflict on the counted file itself, and
// a merge that took either side would have shipped a census that is off by one against the very file
// it pins. Every number below was re-derived from the MERGED `roomzoom-view.js` with the shipped
// `codeOnly` stripper, not adjusted from either branch.
//
// ⭐⭐ AND RE-MEASURED A THIRD TIME BY M3-15 (OD-N, 2026-07-31), WHICH **DELETED** THE OPERATE VERB.
// Both counts FELL by exactly the verb's two references — `_deviceCond` 5 → 4 (`roomOperableTiles`
// is gone) and `deviceConditionAt` 3 → 2 (`doOperate` is gone) — and BOTH NUMBERS WERE READ OFF THE
// FAILING ASSERTION'S OWN `actual`, not subtracted from 5 and 3. That is the same rule the merge
// paragraph above records, applied to a deletion instead of a merge: a census you computed is not a
// census you measured. The seam's MEANING is unchanged and now has ONE owner again — exactly one
// thing draws the wear (`buildTileItem`, through `furnitureSvg`) — and `open` has NO client reader at
// all, which is a fact about the channel, not about this seam.
const WEAR_SEAM_CENSUS = Object.freeze({
  // the `let` declaration, the repaint assignment, the accessor's own `.get`, and the map handed to
  // `furnitureSvg` (the draw)
  _deviceCond: 4,
  // the exported declaration + M2-10's `onCanvasContext`, which asks the same "is there anything
  // here?" question for the right-click PRIORITISE menu. It reads NOTHING but presence — `cond` and
  // `oper` still have exactly one consumer each — and it is here because the `devices` channel is the
  // fog-gated population the host resolves an order through, so a menu offered anywhere else would
  // promise an order the sim cannot take.
  deviceConditionAt: 2,
  roomDeviceConditions: 2,  // the import + the one repaint call
  decodeDevices: 2,         // the import + the one repaint call
  getDevices: 1,            // the single `Hud.getDevices()` inside that same repaint call
  buildTileItem: 2,         // the import from items/wear.js + the ONE call in furnitureSvg
});

/** How many times each wear-seam identifier appears in `src` (which must already be comment-free). */
function wearSeamCensus(src) {
  const out = {};
  for (const name of Object.keys(WEAR_SEAM_CENSUS)) {
    out[name] = (src.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
  }
  return out;
}

test('the wear layer draws through exactly ONE seam — pinned by REFERENCE COUNT, not by a naming convention', () => {
  assert.deepEqual(wearSeamCensus(ROOMZOOM), { ...WEAR_SEAM_CENSUS },
    'the wear seam has grown (or lost) a reference in roomzoom-view.js. If it GREW, ask which of the\n'
    + 'five routes moved: a second `decodeDevices`/`roomDeviceConditions` is a re-derivation of a\n'
    + 'channel this file already decodes once per repaint, and a second `buildTileItem` (or a bare\n'
    + 'condition comparison anywhere in this file) is a SECOND ANSWER to "which picture" — the\n'
    + 'hand-mirror defect that shipped the device-sprite bug. If the counts FELL, the seam is being\n'
    + 'dismantled: `deviceConditionAt` is on its way to being inert, or the draw has been unwired.');
});

// ⚠️ INCLUSION CONTROL, not a population count. CLAUDE.md's fourth trap: "non-vacuity by population
// count proves a matcher matched something; it never proves it would match the THING". Each row below
// is a real drawing shape planted into a copy of the shipped source — including the four the previous
// regex could not see — and each must move the census. The `furnitureSvg` row is a SUBSTITUTION into
// the real call site, not an inserted line, because that is how the likeliest violation would arrive.
const RAW_ROOMZOOM = read(join(CLIENT, 'src/ui/roomzoom-view.js'));
const DRAW_ANCHOR = "  body += markLayerSvg(_markTiles, _focus);";
const PLANTED_LAYERS = [
  ['body += wearLayerSvg(...) — the ONE shape the old regex caught',
    (s) => s.replace(DRAW_ANCHOR, DRAW_ANCHOR + "\n  body += wearLayerSvg(_deviceCond, _focus);")],
  ['body += wreckSvg(...) — a different noun',
    (s) => s.replace(DRAW_ANCHOR, DRAW_ANCHOR + "\n  body += wreckSvg(_deviceCond, _focus);")],
  ['body += damagedDeviceSvg(...) — a different adjective',
    (s) => s.replace(DRAW_ANCHOR, DRAW_ANCHOR + "\n  body += damagedDeviceSvg(_deviceCond, _focus);")],
  // ⚠️ THIS ROW USED TO PLANT `_deviceCond` INTO THE `furnitureSvg` CALL — *"the likeliest real
  // shape, since that is where device art already draws"*. It was right: W0b did exactly that, so
  // the plant is now the SHIPPED LINE and cannot be planted. It is replaced by its mirror image —
  // a SECOND, independent wear read threaded into the same call — because the violation this file
  // must now catch is not "the data got drawn" but "the data got drawn TWICE, two different ways".
  ['a SECOND wear source threaded into furnitureSvg beside the real one',
    (s) => s.replace('itemStackTileKeys(_itemTiles), _deviceCond);',
      'itemStackTileKeys(_itemTiles), roomDeviceConditions(decodeDevices(Hud.getDevices()), _focus));')],
  ['a bare threshold comparison in this file — a SECOND answer to "which picture"',
    (s) => s.replace(DRAW_ANCHOR,
      DRAW_ANCHOR + "\n  body += wearSvg(deviceConditionAt(0, 0), buildTileItem);")],
  ['parts.push(...) then body += parts.join(\'\') — not a `body +=` call at all',
    (s) => s.replace(DRAW_ANCHOR,
      DRAW_ANCHOR + "\n  const wearParts = [];\n  wearParts.push(wearLayerSvg(_deviceCond));\n  body += wearParts.join('');")],
  ['a layer that calls the exported accessor instead of touching the map',
    (s) => s.replace(DRAW_ANCHOR, DRAW_ANCHOR + "\n  body += wearSvg(deviceConditionAt(_focus.rx, _focus.ry));")],
  ['a layer that RE-DERIVES from the channel, never touching _deviceCond',
    (s) => s.replace(DRAW_ANCHOR,
      DRAW_ANCHOR + "\n  body += wearSvg(roomDeviceConditions(decodeDevices(Hud.getDevices()), _focus));")],
];

for (const [name, plant] of PLANTED_LAYERS) {
  test(`INCLUSION CONTROL: a planted wear layer is CAUGHT — ${name}`, () => {
    const mutated = plant(RAW_ROOMZOOM);
    assert.notEqual(mutated, RAW_ROOMZOOM,
      'the plant did not apply — the anchor text has moved, so this control is asserting nothing. '
      + 'Re-find the call site in roomzoom-view.js; do NOT delete the row.');
    assert.notDeepEqual(wearSeamCensus(codeOnly(mutated)), { ...WEAR_SEAM_CENSUS },
      `A DRAWING LAYER OF THIS SHAPE WOULD NOT BE CAUGHT: ${name}. The census above is then the same `
      + 'kind of guard the old regex was — one that passes for every violation it was not written to '
      + 'imagine.');
  });
}

test('CONTROL: the census does NOT fire on an unrelated edit to roomzoom-view.js', () => {
  // Without this, the seven controls above are equally satisfied by a census that flags EVERYTHING,
  // which would make the pin unmaintainable and would train the next lane to delete it.
  const noise = RAW_ROOMZOOM.replace(DRAW_ANCHOR, DRAW_ANCHOR + "\n  body += glowSvg(1, 2);");
  assert.notEqual(noise, RAW_ROOMZOOM, 'the anchor text has moved — this control asserts nothing');
  assert.deepEqual(wearSeamCensus(codeOnly(noise)), { ...WEAR_SEAM_CENSUS },
    'the census moved for an edit that does not touch the wear seam at all');
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

// ═══════════════════════════════════ THE SEAM, DRIVEN through the SHIPPING Room Zoom controller
//
// ⚠️ THIS SECTION EXISTS BECAUSE `deviceConditionAt` COULD BE COMPLETELY INERT WITH THE WHOLE GATE
// GREEN. It was pinned only by `assert.match(ROOMZOOM, /export function deviceConditionAt\(/)` — a
// scan for the SIGNATURE. Independent review replaced its body with `return null;` and with
// `return _deviceCond.get('0,0')`, and both times the node suite read 843/843 PASS, 0 FAIL. The one
// seam this whole package exists to deliver was provably allowed not to work. That is the BINDING
// "verb parity is NOT sufficient" lesson in its exact shape: the export is present, and its presence
// is all anything checked.
//
// So the seam is now driven end to end: `initRoomZoom` + `enter()` + the real repaint over dom-lite,
// fed by the real `Hud.renderDevices` receive path, and read back through the exported accessor. The
// rig is the one `device-sprite-coverage.test.js` uses; it is REBUILT here rather than imported
// because that file belongs to the ground-item art lane, and two lanes editing one test module is
// the merge shape that has already broken this repo once.

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
class DevEl extends DomEl {
  constructor(doc, tag) { super(doc, tag); this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  closest() { return null; }
}
class DevDoc extends DomDocument {
  constructor() { super(); this.body = new DevEl(this, 'body'); }
  createElement(tag) { return new DevEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const devDoc = new DevDoc();
for (const id of RZ_IDS) { const e = new DevEl(devDoc, 'div'); e._id = id; devDoc.register(id, e); }
globalThis.document = devDoc;
globalThis.window = { addEventListener() {}, removeEventListener() {} };

// Resolved AFTER the globals — both modules touch `document` at import time.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":1,"slots":[[0,4,6,12,8,"quarters",5,true,true]]}]}';
const ROOMS_JSON = '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96]]}';
const RECT = roomTileRect(decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON))), 'quarters');

/** An all-floor frame for `deck` — the Room Zoom repaints the canvas from it before the layers. */
function floorFrame(deck, w = 24, h = 20) {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  return { type: 'frame', deck, w, h, lens: 'none', cells };
}

/** Push a `devices` payload through the REAL receive path (a JSON string → `decode` → the dispatch
 *  hud.js exposes), then force a synchronous repaint by re-entering the room. `scheduleRepaint` is
 *  rAF-coalesced and this rig has no rAF, so re-entry is how a test gets a frame it can read. */
function driveDevices(cells) {
  Hud.renderDevices(decode(JSON.stringify({ type: 'devices', cells })));
  RoomZoom.exitRoom();
  RoomZoom.enterRoom('quarters');
}

test('deviceConditionAt returns the LIVE row for a tile — driven, not scanned', () => {
  assert.ok(RECT && RECT.deck === 1, 'the room fixture did not resolve — the rig is not driving anything');
  RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));
  Hud.renderFrame(floorFrame(RECT.deck));

  const worn = [RECT.rx + 1, RECT.ry + 1];
  const fresh = [RECT.rx + 2, RECT.ry + 1];
  const bare = [RECT.rx + 3, RECT.ry + 1];

  driveDevices([
    [worn[0], worn[1], RECT.deck, 8, 26, 0, 0, 1],      // a Light, nearly wrecked, inoperative, shut
    [fresh[0], fresh[1], RECT.deck, 13, 255, 1, 1, 1],  // a Fabricator, pristine, running, open
  ]);

  // NON-VACUITY: the repaint really ran. Without this, everything below is also satisfied by a rig
  // in which `enter()` silently failed and `_deviceCond` was never refreshed at all.
  assert.ok(devDoc.getElementById('rz-layers').innerHTML.length > 0,
    'the Room Zoom drew nothing — `enter()` did not repaint, so this rig cannot see the seam');

  // TWO DIFFERENT ROWS, so no constant return value satisfies both. `return null` and
  // `return _deviceCond.get('0,0')` — the two mutations that survived the old signature scan — each
  // fail on the first of these.
  assert.deepEqual(RoomZoom.deviceConditionAt(worn[0], worn[1]),
    { tx: worn[0], ty: worn[1], kind: 8, cond: 26, oper: 0, open: 0, serv: 1, air: 1 },
    'deviceConditionAt did not return the worn device\'s row. This is THE seam the wrecked-art\n'
    + 'package reads; a signature scan cannot tell an implementation from `return null`.');
  assert.deepEqual(RoomZoom.deviceConditionAt(fresh[0], fresh[1]),
    { tx: fresh[0], ty: fresh[1], kind: 13, cond: 255, oper: 1, open: 1, serv: 1, air: 1 },
    'the second row disagrees — a constant or a single-tile lookup would pass the first leg alone');

  assert.equal(RoomZoom.deviceConditionAt(bare[0], bare[1]), null,
    'an EMPTY tile must answer null, not undefined and not a stale neighbour: the art join branches '
    + 'on it, and `undefined` would read as "no device" only by accident of falsiness');
});

test('deviceConditionAt FOLLOWS the channel — it is not a snapshot taken at entry', () => {
  RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));
  Hud.renderFrame(floorFrame(RECT.deck));
  const t = [RECT.rx + 1, RECT.ry + 2];

  driveDevices([[t[0], t[1], RECT.deck, 8, 255, 1]]);
  assert.equal(RoomZoom.deviceConditionAt(t[0], t[1]).cond, 255, 'the first payload did not arrive');

  driveDevices([[t[0], t[1], RECT.deck, 8, 26, 0]]);   // the machine wore out
  const after = RoomZoom.deviceConditionAt(t[0], t[1]);
  assert.equal(after.cond, 26,
    'the seam kept the FIRST payload\'s condition. `_deviceCond` is refreshed once per repaint from '
    + 'the live channel; a latched map means the art would show wear that healed hours ago.');
  assert.equal(after.oper, 0, 'the operational bit latched too');

  driveDevices([]);   // …and the device was stripped
  assert.equal(RoomZoom.deviceConditionAt(t[0], t[1]), null,
    'a device REMOVED from the channel still answers. A map that only ever grows would keep drawing '
    + 'a wreck on an empty tile.');
});

test('deviceConditionAt applies the room filter on the driven path too', () => {
  RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));
  Hud.renderFrame(floorFrame(RECT.deck));

  const inside = [RECT.rx, RECT.ry];
  // ⚠️ THE WRONG-DECK ROW SITS ON THE SAME TILE AND CARRIES A DIFFERENT `cond`, AND IT IS LAST.
  // CLAUDE.md's fifth trap shape shipped from exactly this fixture built carelessly: a wrong-deck row
  // on a FREE tile is caught by the tile list, but a wrong-deck row on an OCCUPIED tile folds into the
  // existing entry and moves nothing visible — unless its payload differs and it wins the fold. With
  // the deck filter dead, `cond` here reads 7.
  driveDevices([
    [inside[0], inside[1], RECT.deck, 8, 100, 1],
    [RECT.rx + RECT.rw, RECT.ry, RECT.deck, 8, 100, 1], // one tile past the right edge
    [inside[0], inside[1], RECT.deck + 1, 8, 7, 0],     // same tile, WRONG DECK, and LAST
  ]);

  assert.equal(RoomZoom.deviceConditionAt(inside[0], inside[1]).cond, 100,
    'CONTROL + the deck filter: the in-rect on-deck row must survive AND must not be overwritten by '
    + 'the wrong-deck row sharing its tile. A 7 here means the deck filter is dead on the driven path.');
  assert.equal(RoomZoom.deviceConditionAt(RECT.rx + RECT.rw, RECT.ry), null,
    'a row one tile past the focus rect reached the seam — the rect filter is dead on the driven path');
});

// ═════════════════════════ THE JOIN, DRIVEN through the same shipping controller (W0b)
//
// The seam tests above prove the DATA reaches the Room Zoom. They say nothing about whether anything
// draws it — which is precisely the hole `deviceConditionAt` fell into (`return null` with 843/843
// green). So this drives the whole path: a real `frame` carrying a device glyph, a real `devices`
// payload through `Hud.renderDevices`, a real repaint, and the ART READ BACK OUT of the layer HTML
// and compared BYTE-FOR-BYTE against `buildWrecked` with the surface's own idPrefix.
//
// ⚠️ `notEqual` BETWEEN THE TWO RENDERS WOULD NOT BE ENOUGH, and that is the fourth trap (a correct
// assertion satisfied by an unrelated path): the two payloads differ, so almost any incidental
// dependence on the channel would move some byte. The assertion is that the exact twin fragment is
// present in one and absent in the other.

/** A frame for `deck` that is all floor except one tile carrying `glyph`. */
function frameWithDevice(deck, tx, ty, glyph, w = 24, h = 20) {
  const f = floorFrame(deck, w, h);
  f.cells[ty * w + tx] = [glyph.charCodeAt(0), 0, 0, 0];
  return f;
}

test('a machine below the wreck floor is PAINTED as its twin on the Room Zoom — driven', () => {
  const tx = RECT.rx + 1, ty = RECT.ry + 1;
  RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));
  Hud.renderFrame(frameWithDevice(RECT.deck, tx, ty, 'S'));   // Glyphs.ForDevice(Scrubber)

  const layers = () => devDoc.getElementById('rz-layers').innerHTML;

  driveDevices([[tx, ty, RECT.deck, 3, 255, 1]]);
  const intact = layers();
  driveDevices([[tx, ty, RECT.deck, 3, 0, 0]]);
  const wrecked = layers();

  // NON-VACUITY: the repaint ran and the scrubber is really on the tile.
  assert.ok(intact.includes('rz-furniture'), 'the Room Zoom drew no furniture layer — the rig is dead');
  assert.equal(itemIdForGlyphChar('S'), 'o2-scrubber', 'the fixture glyph no longer resolves');

  // The surface builds with `{ w: ITEM_SIDE, h: ITEM_SIDE, idPrefix: 'rz-f-<tx>-<ty>' }`. Only the
  // idPrefix is needed to reproduce the DEF ids and the twin's distinguishing fills; the geometry is
  // scaled by `render(w,h)` and is identical between the two states.
  const opts = { idPrefix: `rz-f-${tx}-${ty}` };
  const twinOnly = (buildWrecked('o2-scrubber', opts).match(/fill="[^"]+"/g) || [])
    .filter((f) => !(buildItem('o2-scrubber', opts).match(/fill="[^"]+"/g) || []).includes(f));
  assert.ok(twinOnly.length > 0, 'non-vacuity: the twin has fills the pristine piece does not');

  for (const f of twinOnly.slice(0, 4)) {
    assert.ok(wrecked.includes(f),
      `a device at cond 0 did NOT wear its twin: the layer is missing ${f}. The join is unwired, or\n`
      + '`_deviceCond` is not being handed to furnitureSvg.');
    assert.ok(!intact.includes(f),
      `a PRISTINE device already carries the twin's ${f} — the join is drawing the twin always, which\n`
      + 'a two-render inequality test would never have caught.');
  }

  // …and the boundary, on the driven path rather than only in the pure one: one byte either side.
  driveDevices([[tx, ty, RECT.deck, 3, WRECK_COND_BYTE, 1]]);
  const atFloor = layers();
  driveDevices([[tx, ty, RECT.deck, 3, WRECK_COND_BYTE - 1, 1]]);
  const belowFloor = layers();
  assert.ok(!atFloor.includes(twinOnly[0]), 'a device AT the floor is not below it — the def says "below"');
  assert.ok(belowFloor.includes(twinOnly[0]), 'one byte below the floor must already wear the twin');
});

test('a tile with NO device on the channel keeps its ordinary art', () => {
  const tx = RECT.rx + 2, ty = RECT.ry + 2;
  RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));
  Hud.renderFrame(frameWithDevice(RECT.deck, tx, ty, 'S'));

  driveDevices([]);   // the channel says nothing about this tile at all
  const html = devDoc.getElementById('rz-layers').innerHTML;
  const opts = { idPrefix: `rz-f-${tx}-${ty}` };
  const twinOnly = (buildWrecked('o2-scrubber', opts).match(/fill="[^"]+"/g) || [])
    .filter((f) => !(buildItem('o2-scrubber', opts).match(/fill="[^"]+"/g) || []).includes(f));
  assert.ok(twinOnly.length > 0, 'non-vacuity');
  assert.ok(!html.includes(twinOnly[0]),
    'an unreported tile drew the WRECKED twin. "No row" must mean "not known to be wrecked": on a\n'
    + 'reconnect, on the first frames, or against an older host, the whole ship would otherwise\n'
    + 'appear raided — a lie the player cannot tell apart from the real thing.');
  assert.ok(html.includes('rz-furniture'), 'and the piece must still be drawn');
});
