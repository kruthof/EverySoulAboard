// THE `blocked` CHANNEL, CLIENT SIDE — the decoder, the per-room fold, the SVG layer, the key, and
// THE WHOLE SEAM DRIVEN END TO END through the shipping Room Zoom controller.
//
// WHAT THIS CHANNEL IS. `WorksiteSafety.CanStageWorkerAt` refuses to park a worker on a tile whose
// air would pull it off the job. Its own header records the price: the failure went from
// expensive-and-visible to CHEAP-AND-INVISIBLE — an order painted in an airless compartment simply
// never progresses, silently, with nothing on any surface saying why. The predicate is LIVE: the sim
// asks it, acts, and discards the answer, so there is no tile flag, no registry entry and no
// projection byte a client could have read instead. This channel is the only route.
//
// ⚠️ THE SHAPE OF THIS FILE IS DICTATED BY TWO BINDING LESSONS.
//
//   1. "VERB PARITY IS NOT SUFFICIENT." The `devices` lane shipped an accessor that could
//      `return null` for everything with all 843 node tests green, because the only guard was a scan
//      for its own signature. So the layer here is NOT checked by asking whether
//      `blockedLayerSvg` is CALLED — it is driven through `initRoomZoom` + `enterRoom()` + a real
//      repaint, and the DRAWN OUTPUT is required to CHANGE when the channel changes. A builder that
//      returned '' fails; a view that stopped calling it fails; a cache that latched fails.
//   2. "`assert` THROWS, so only the FIRST leg of a multi-leg test reports" (the fifth trap shape).
//      Every rejection leg of `roomBlockedTiles` — deck, x-range, y-range — is run with the others
//      BLINDED and required to fire ALONE.
//
// Source scans read CODE, NOT PROSE (`codeOnly`, CLAUDE.md traps §1), and both directions are
// controlled at the bottom of this file: a comment must not trip a scan, and real code must.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  decode, decodeBlocked, decodeDecks, decodeRooms,
  BLOCKED_ORDER_NAMES, BLOCKED_REASON_NAMES, BLOCKED_REASON_TEXT,
  BLOCKED_ORDER_DIG, BLOCKED_ORDER_STRIP, BLOCKED_ORDER_BUILD, BLOCKED_ORDER_REPAIR,
  blockedOrderName,
  BLOCKED_REASON_AIR, BLOCKED_REASON_NO_APPROACH, BLOCKED_REASON_NO_CONSUMABLE,
  BLOCKED_REASON_UNREACHABLE, BLOCKED_REASON_WORK_TYPE_OFF, BLOCKED_REASON_NO_ROUTE,
  BLOCKED_DETAIL_NONE, BLOCKED_CID_NONE, ITEM_WORDS, itemWords, blockedReasonSentence,
} from '../src/wire/messages.js';
import { roomBlockedTiles, roomTileRect } from '../src/ui/room-model.js';
import { blockedCellSvg, blockedBadgeSvg, blockedLayerSvg, blockedKeyHtml } from '../src/ui/blocked-overlay.js';
import { decksView } from '../src/ui/decks-model.js';
import { codeOnly } from './code-only.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { stylesSource } from './styles-source.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

const WIRE_BLOCKED_CS = codeOnly(read(join(REPO, 'hosts/web/WireFormat.Blocked.cs')));
const GAME_SESSION_CS = codeOnly(read(join(REPO, 'hosts/web/GameSession.cs')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));

/** A room rect covering tiles [4..8) × [2..5) on deck 1 — the shape `roomTileRect` produces. */
const ROOM = { deck: 1, rx: 4, ry: 2, rw: 4, rh: 3 };

const msg = (cells) => ({ type: 'blocked', cells });

// ════════════════════════════════════════════════════════════ the cross-language tuple contract

// MUTATION: swap `.Append(c.Order…)` and `.Append(c.Reason…)` in WireFormat.Blocked.cs ⇒ this fails
// and names the file. MUTATION 2: reorder the `BlockedCell` constructor parameters ⇒ same.
test('the wire tuple order is [x, y, deck, order, reason, detail, cid] on BOTH sides of the seam', () => {
  const emitted = [...WIRE_BLOCKED_CS.matchAll(/\.Append\(c\.(\w+)\.ToString\(BlockedIc\)\)/g)].map((m) => m[1]);
  assert.deepEqual(emitted, ['X', 'Y', 'Deck', 'Order', 'Reason', 'Detail', 'Cid'],
    'hosts/web/WireFormat.Blocked.cs no longer appends the tuple in the order this client reads it. '
    + 'The tuple is POSITIONAL — a swap reports a dig as a strip, or "no approach" as "no air" — and '
    + 'there is no compiler across this seam.');

  const ctor = /BlockedCell\(int (\w+), int (\w+), int (\w+), int (\w+), int (\w+), int (\w+), int (\w+)\)/
    .exec(WIRE_BLOCKED_CS);
  assert.ok(ctor, 'the BlockedCell constructor was not found — this parse has rotted, and the append '
    + 'scan alone cannot see a CALLER that fills the fields in the wrong order');
  assert.deepEqual(ctor.slice(1, 8), ['x', 'y', 'deck', 'order', 'reason', 'detail', 'cid']);
});

// ⭐ M3-13 — THE SENTINEL IS PINNED ACROSS THE SEAM TOO, and it is NOT covered by the tuple-order
// test above: an append scan sees the POSITION of `Detail`, never its "nothing to say" value. If the
// host sent 0 and this client kept −1, every non-detailed row would claim to want Regolith
// (`ItemKind 0`) and the badge would read "NEEDS REGOLITH" on a vacuum refusal.
// MUTATION: change `DetailNone` to 0 in the C# ⇒ red here.
test('DetailNone is pinned equal on both sides — a sentinel that disagrees is a payload', () => {
  const m = /public const int DetailNone\s*=\s*(-?\d+)\s*;/.exec(WIRE_BLOCKED_CS);
  assert.ok(m, 'hosts/web/WireFormat.Blocked.cs no longer declares `DetailNone` — this parse rotted');
  assert.equal(Number(m[1]), BLOCKED_DETAIL_NONE);
  assert.equal(BLOCKED_DETAIL_NONE, -1,
    'the sentinel must stay OUT of the ItemKind range: 0 is Regolith, and a 0 sentinel cannot be '
    + 'told from a real payload');
});

// ⭐⭐ D5 OVERVIEW — THE SECOND SENTINEL, PINNED THE SAME WAY AND FOR THE SAME REASON. `CidNone` is a
// hand mirror across a seam with no compiler, and an append scan sees the POSITION of `Cid`, never
// its "belongs to nobody" value. If the host sent 0 and this client kept −1, every dig/strip/build
// row would claim to be crew 0's personal order and the Overview dock would put a fault sentence on
// whichever crew member happens to hold that id.
// MUTATION: change `CidNone` to 0 in the C# ⇒ red here.
test('CidNone is pinned equal on both sides — a sentinel that disagrees is a citizen id', () => {
  const m = /public const int CidNone\s*=\s*(-?\d+)\s*;/.exec(WIRE_BLOCKED_CS);
  assert.ok(m, 'hosts/web/WireFormat.Blocked.cs no longer declares `CidNone` — this parse rotted');
  assert.equal(Number(m[1]), BLOCKED_CID_NONE);
  assert.equal(BLOCKED_CID_NONE, -1,
    'the sentinel must stay OUT of the citizen-id range: ids are unsigned and 0 is not reserved, so '
    + 'a 0 sentinel cannot be told from a real owner');
});

// The house tripwire idiom: marks-model.test.js parses WireFormat.Marks.cs, zone-model.test.js parses
// WireFormat.Zones.cs, palette.test.js parses GlyphColor.cs.
// MUTATION: renumber `ReasonNoApproach = 1` to `= 5` in the C# ⇒ this fails by name.
test('the order and reason vocabularies are pinned EQUAL to the host constants', () => {
  const constOf = (name) => {
    const m = new RegExp('public const int ' + name + '\\s*=\\s*(\\d+)\\s*;').exec(WIRE_BLOCKED_CS);
    assert.ok(m, `hosts/web/WireFormat.Blocked.cs no longer declares '${name}' — this parse has rotted`);
    return Number(m[1]);
  };
  assert.equal(constOf('OrderDig'), BLOCKED_ORDER_DIG);
  assert.equal(constOf('OrderStrip'), BLOCKED_ORDER_STRIP);
  assert.equal(constOf('OrderBuild'), BLOCKED_ORDER_BUILD);
  assert.equal(constOf('OrderRepair'), BLOCKED_ORDER_REPAIR);
  assert.equal(constOf('ReasonAir'), BLOCKED_REASON_AIR);
  assert.equal(constOf('ReasonNoApproach'), BLOCKED_REASON_NO_APPROACH);
  assert.equal(constOf('ReasonNoConsumable'), BLOCKED_REASON_NO_CONSUMABLE);
  assert.equal(constOf('ReasonUnreachable'), BLOCKED_REASON_UNREACHABLE);
  assert.equal(constOf('ReasonWorkTypeOff'), BLOCKED_REASON_WORK_TYPE_OFF);
  assert.equal(constOf('ReasonNoRoute'), BLOCKED_REASON_NO_ROUTE);

  // The NAME tables are indexed BY the wire value, so a hole or a reorder mis-labels every badge.
  assert.deepEqual(BLOCKED_ORDER_NAMES, ['dig', 'strip', 'build', 'repair']);
  assert.deepEqual(BLOCKED_REASON_NAMES,
    ['air', 'no_approach', 'no_consumable', 'unreachable', 'work_type_off', 'no_route']);
  for (const name of BLOCKED_REASON_NAMES) {
    assert.ok(BLOCKED_REASON_TEXT[name], `reason '${name}' has no player-facing sentence — a badge `
      + 'with no words is the silence this channel exists to remove, wearing a new costume');
  }
});

// ⭐⭐ THE HOLE THAT SHIPPED, AND THE GUARD THAT WOULD HAVE CAUGHT IT. `BLOCKED_ORDER_NAMES` had
// THREE entries while the host had emitted FOUR order values since M2-9, so `blockedOrderName(3)`
// answered `''`, `roomBlockedTiles` fell back to its literal `'ORDER'`, and every direct repair order
// in the game wore `ORDER BLOCKED — …`. ⛔ The `deepEqual` above could not see it: it pins the array
// against a HAND-WRITTEN literal, so a hole is only caught by whoever remembered to widen the
// literal — which is the same hand that forgot the entry. This test derives the expectation from the
// HOST instead (`DEVICE_KIND_NAMES`' precedent, M2-10: read the enum, require agreement member for
// member, by name AND by index).
// MUTATION: drop `'repair'` from BLOCKED_ORDER_NAMES ⇒ red here and in the label leg below.
// MUTATION 2: append `public const int OrderThaw = 4;` to WireFormat.Blocked.cs ⇒ red here, by name.
test('every order value the HOST declares has a name in this client — derived, not hand-copied', () => {
  const declared = [...WIRE_BLOCKED_CS.matchAll(/public const int Order(\w+)\s*=\s*(\d+)\s*;/g)]
    .map((m) => [m[1].toLowerCase(), Number(m[2])]);

  // NON-VACUITY BY INCLUSION (traps §5, 4th shape): a parse that matched nothing would pass every
  // assertion in the loop below without running one of them.
  assert.equal(declared.length, 4,
    `hosts/web/WireFormat.Blocked.cs declares ${declared.length} Order* constants and this test `
    + 'expects 4 — if a verb was added, name it in BLOCKED_ORDER_NAMES and raise this number');
  assert.deepEqual(declared.map((d) => d[1]), [0, 1, 2, 3],
    'the Order* constants are no longer 0..3 in declaration order — the names table is indexed BY '
    + 'the wire value, so a gap or a reorder mis-labels badges rather than dropping them');

  for (const [name, value] of declared) {
    assert.equal(BLOCKED_ORDER_NAMES[value], name,
      `the host emits order ${value} as \`${name}\` and this client calls it `
      + `\`${BLOCKED_ORDER_NAMES[value]}\`. A badge reading the wrong verb is worse than no badge: `
      + 'it tells the player to go and look at the wrong screen.');
    assert.equal(blockedOrderName(value), name);
  }
  assert.equal(BLOCKED_ORDER_NAMES.length, declared.length,
    'this client names an order the host does not declare — a word with no wire value behind it');
});

// ⭐ THE PLAYER-VISIBLE HALF OF THE SAME FIX, DRIVEN THROUGH THE REAL FOLD rather than asserted on
// the table. `roomBlockedTiles` builds the badge label, and its fallback (`b.orderName || 'ORDER'`)
// is what turned the missing name into a plausible-looking sentence instead of an empty one — the
// exact shape that let it live for four days of playtesting.
test('a direct repair order badges REPAIR BLOCKED, not the generic ORDER BLOCKED', () => {
  const rows = decodeBlocked(msg([[5, 3, 1, BLOCKED_ORDER_REPAIR, BLOCKED_REASON_NO_ROUTE, BLOCKED_DETAIL_NONE]]));
  assert.equal(rows[0].orderName, 'repair');

  const tiles = roomBlockedTiles(rows, ROOM);
  assert.equal(tiles.length, 1, 'the row must land inside the room rect, or this leg is vacuous');
  assert.equal(tiles[0].label, 'REPAIR BLOCKED — NO WAY TO WALK TO IT');
  assert.ok(!tiles[0].label.startsWith('ORDER BLOCKED'),
    'the generic fallback is back: the player is told an unnamed "order" is stuck on a machine they '
    + 'right-clicked and told to REPAIR');

  // ⚠️ THE KEY BOX IS THE SURFACE THAT NEEDS NO HOVER — this module's own header calls the `<title>`
  // inadequate on its own, so the verb has to reach the VISIBLE key too. `blockedKeyHtml` skips any
  // order name it reads as the literal 'ORDER', which is exactly what the missing entry produced.
  const key = blockedKeyHtml(tiles);
  assert.match(key, /1 REPAIR ORDER STUCK/,
    'the visible key still reads the generic "1 ORDER STUCK" for a repair the player ordered by name');
});

// MUTATION: delete `case 'blocked'` from main.js ⇒ this fails here AND in
// tests/Perilune.Tests/SurfaceBoundaryTests.cs, which fails BY NAME for a channel with no consumer.
test('the channel is dispatched by the standard client and cached for a reconnect', () => {
  assert.match(MAIN, /case 'blocked':\s*Hud\.renderBlocked\(m\);/,
    'client/src/main.js does not dispatch the `blocked` channel');
  // `Snapshot`'s key list is THE thing that makes a channel survive a reconnect. This payload is a
  // function of what the player painted and of compartment air — both can sit unchanged for hours —
  // so an omitted channel would leave a reconnected tab silent for exactly that long (the measured
  // `materials` shape: 0 messages in 4 s; NOT the self-healing `ledger` shape).
  const keys = /foreach \(var key in new\[\] \{([^}]*)\}\)/.exec(GAME_SESSION_CS);
  assert.ok(keys, 'GameSession.Snapshot\'s key list was not found — this parse has rotted');
  assert.match(keys[1], /"blocked"/,
    'the `blocked` channel is missing from GameSession.Snapshot\'s key list, so a reconnecting tab '
    + 'renders no badges at all until the player next paints something');
});

// ══════════════════════════════════════════════════════════════════════════════ the decoder

test('decodeBlocked reads the tuple and names both codes', () => {
  const out = decodeBlocked(msg([[5, 6, 1, BLOCKED_ORDER_STRIP, BLOCKED_REASON_AIR,
                                  BLOCKED_DETAIL_NONE, BLOCKED_CID_NONE]]));
  assert.deepEqual(out, [{
    x: 5, y: 6, deck: 1, order: 1, reason: 0, detail: -1, cid: -1,
    orderName: 'strip', reasonName: 'air',
  }]);
});

// ⭐⭐ M3-13 — THE APPENDED ELEMENT, AND THE OLDER-HOST ROW BESIDE IT. The 5-element row is what a
// host from before this package emits, and it must still decode: raising the length gate to 6 would
// drop every row mid-upgrade, which is silence on the anti-silence channel.
// MUTATION: change the `t.length > 5` guard to `t.length > 4` (i.e. read `t[5]` unconditionally) ⇒
// the short row's `detail` becomes 0 and leg 2 reddens.
test('decodeBlocked reads `detail`, and a FIVE-element row from an older host still decodes', () => {
  const six = decodeBlocked(msg([[5, 6, 1, BLOCKED_ORDER_STRIP, BLOCKED_REASON_NO_CONSUMABLE, 6]]));
  assert.equal(six[0].detail, 6, 'the sixth element did not reach the decoded row');

  const five = decodeBlocked(msg([[5, 6, 1, BLOCKED_ORDER_STRIP, BLOCKED_REASON_NO_CONSUMABLE]]));
  assert.equal(five.length, 1, 'a five-element row from an older host was DROPPED');
  assert.equal(five[0].detail, BLOCKED_DETAIL_NONE,
    'a missing sixth element must read as "nothing to say", never as ItemKind 0 (Regolith)');
});

test('decodeBlocked is tolerant: a bad message is null, a bad row is dropped, it never throws', () => {
  assert.equal(decodeBlocked(null), null);
  assert.equal(decodeBlocked({ type: 'marks', cells: [] }), null, 'a different channel is not this one');
  assert.equal(decodeBlocked({ type: 'blocked' }), null, 'no cells array at all');
  assert.deepEqual(decodeBlocked(msg([])), []);
  assert.deepEqual(
    decodeBlocked(msg([[1, 2, 0, 0], null, 'nope', [1, 2, 0, 0, 0]])).map((r) => r.x),
    [1], 'a short row, a null and a string are dropped; the well-formed row survives');
});

// This is the OPPOSITE of `decodeMarks` and the same as `decodeItems`/`decodeDevices`; the divergence
// is deliberate and the reasoning is specific to what a row MEANS here.
// MUTATION: add `if (!reasonName) continue;` to decodeBlocked ⇒ red.
test('a row whose codes this client cannot NAME is KEPT — dropping it would restore the silence', () => {
  const out = decodeBlocked(msg([[3, 3, 0, 99, 98]]));
  assert.equal(out.length, 1,
    'a row from a NEWER host was dropped. The payload of a blocked row is "THIS TILE IS STUCK", and '
    + 'that survives a code this client has never heard of. Dropping it draws a clear tile over a '
    + 'stuck one — which is the exact failure this channel exists to remove, arriving through the '
    + 'decoder instead of through the sim.');
  assert.equal(out[0].reasonName, '', 'an unknown code names as empty, never as a wrong name');
  assert.equal(out[0].orderName, '');
});

// ══════════════════════════════════════ M3-13 — THE ITEM VOCABULARY, AND THE BADGE THAT NAMES ONE
//
// ⭐⭐ ONE VOCABULARY, TWO SURFACES (M2-18's rule, the charter's mutation 6). The MOSS POD BAY row
// says `NEEDS 1 CONTROLLER MODULE — SHIP HAS 0`, composed HOST-side by `ThawGate.Describe` out of
// `ThawGate.ItemWords`; the Room Zoom's tile badge says `NEEDS PARTS — …`, composed CLIENT-side out
// of `ITEM_WORDS`, because the `blocked` channel carries a bare `ItemKind` byte and no string. Two
// composers, and the requirement is that they cannot come to spell one item two ways.
//
// ⇒ THE MIRROR IS PINNED BY PARSING THE SIM. The house tripwire idiom: `prioritise-menu.test.js`
// parses `Device.cs`, `stock-filter-model.test.js` parses `ItemStack.cs`, `palette.test.js` parses
// `GlyphColor.cs`. There is no compiler across this seam.
// MUTATION (the charter's 6): re-word `case ItemKind.ControllerModule: return "CONTROLLER MODULE";`
// in `sim/Sim.Core/ThawGate.cs` — to "CTRL MODULE", or to `Enum.ToString()` — ⇒ RED here, which is
// the two surfaces being stopped from drifting rather than merely asked not to.
const THAW_GATE_CS = codeOnly(read(join(REPO, 'sim/Sim.Core/ThawGate.cs')));
const ITEM_STACK_CS = codeOnly(read(join(REPO, 'sim/Sim.Core/Entities/ItemStack.cs')));

/** `ItemKind` member → its byte, parsed from the sim's own enum. */
function parseItemKinds() {
  const body = /enum ItemKind : byte\s*\{([\s\S]*?)\n\s*\}/.exec(ITEM_STACK_CS);
  assert.ok(body, 'sim/Sim.Core/Entities/ItemStack.cs no longer declares `enum ItemKind : byte` — '
    + 'this parse has rotted and every leg below it is measuring nothing');
  const map = {};
  for (const m of body[1].matchAll(/(\w+)\s*=\s*(\d+)/g)) map[m[1]] = Number(m[2]);
  return map;
}

/** The `case ItemKind.X: return "WORDS";` arms of `ThawGate.ItemWords`, in source order. */
function parseItemWordsSwitch() {
  const fn = /public static string ItemWords\(ItemKind kind\)\s*\{([\s\S]*?)\n\s{8}\}/.exec(THAW_GATE_CS);
  assert.ok(fn, 'sim/Sim.Core/ThawGate.cs no longer declares `public static string ItemWords(ItemKind '
    + 'kind)` — either it was made private again (which breaks the one-vocabulary rule outright) or '
    + 'this parse has rotted');
  return [...fn[1].matchAll(/case ItemKind\.(\w+):\s*return "([^"]+)";/g)].map((m) => [m[1], m[2]]);
}

test('the ItemWords parse is NON-VACUOUS — it finds real arms, not an empty match', () => {
  const kinds = parseItemKinds();
  assert.ok(Object.keys(kinds).length >= 10,
    'the ItemKind parse found ' + Object.keys(kinds).length + ' members — it is matching a fragment');
  assert.equal(kinds.ControllerModule, 6, 'the enum parse disagrees with the shipped byte for '
    + 'ControllerModule; every index assertion below would then be checking the wrong slot');
  const arms = parseItemWordsSwitch();
  assert.ok(arms.length >= 3,
    'ThawGate.ItemWords parsed to ' + arms.length + ' arms — a regex that finds nothing makes the '
    + 'agreement test below pass by construction, which is the fourth trap shape exactly');
});

// MUTATION 2 (the charter's 6, from the other side): change 'CONTROLLER MODULE' in `ITEM_WORDS` ⇒
// RED. MUTATION 3: delete an entry from `ITEM_WORDS` ⇒ RED, and the message names the missing item.
test('ITEM_WORDS is pinned EQUAL to ThawGate.ItemWords — one vocabulary, two surfaces', () => {
  const kinds = parseItemKinds();
  for (const [member, words] of parseItemWordsSwitch()) {
    const byte = kinds[member];
    assert.equal(typeof byte, 'number', `ThawGate.ItemWords names ItemKind.${member}, which the enum `
      + 'does not declare — one of the two parses is reading a stale file');
    assert.equal(itemWords(byte), words,
      `THE TWO SURFACES SPELL ItemKind.${member} DIFFERENTLY. The MOSS POD BAY says "${words}" `
      + `(ThawGate.ItemWords, host-composed) and the Room Zoom tile badge says "${itemWords(byte)}" `
      + '(ITEM_WORDS, client-composed). M2-18: one player confusion, two surfaces, and NEITHER may '
      + 'invent a second vocabulary — a player told to make one thing on one screen and another '
      + 'thing on the next has been told nothing.');
  }
  // …and nothing is in the client table that the sim does not name, which is the other direction:
  // a client-only entry is a word the pod bay can never say.
  const named = new Set(parseItemWordsSwitch().map(([m]) => kinds[m]));
  for (const key of Object.keys(ITEM_WORDS)) {
    assert.ok(named.has(Number(key)),
      `ITEM_WORDS carries ItemKind ${key}, which ThawGate.ItemWords does not name — this client `
      + 'would spell an item the MOSS console cannot, which is a second vocabulary by the back door');
  }
  assert.equal(itemWords(99), '', 'an ItemKind this client has never heard of names as empty');
  assert.equal(itemWords(BLOCKED_DETAIL_NONE), '', 'the sentinel is not an item');
});

// ⭐⭐ THE CHARTER'S MUTATION 1, DRIVEN AS IT INSISTS: *"emit a refusal whose `Detail` names an item
// and assert the RENDERED BADGE TEXT changes — never that the array has six elements."*
// APPLY: leave `decodeBlocked` destructuring FIVE elements (drop the `detail:` line) ⇒ the row's
// detail reads −1, the sentence falls back to the generic one, and this reddens. That is the whole
// hazard of a positional array: the decoder KEEPS WORKING and silently drops the field.
// APPLY 2: drop `.Append(c.Detail…)` from `WireFormat.Blocked.cs` ⇒ the same red, from the host end.
test('M3-13 mutation 1: a `detail` on the wire CHANGES THE RENDERED BADGE, driven end to end', () => {
  const at = [ROOM.rx + 1, ROOM.ry + 1];
  const generic = fold([[at[0], at[1], ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_NO_CONSUMABLE]]);
  assert.equal(generic[0].reasonText, BLOCKED_REASON_TEXT.no_consumable,
    'premise: with no detail the badge keeps the sentence it has always had');

  // ⭐ ItemKind 6 = ControllerModule, and it is chosen BECAUSE THE HOST NEVER SENDS IT ON THIS ROW —
  // a repair order wants Parts (the ladder's top tier), never a module. That is exactly what makes
  // it the right probe: if this client rendered a hard-coded word instead of the byte that arrived,
  // a value the host cannot produce is the one input that would expose it.
  const named = fold([[at[0], at[1], ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_NO_CONSUMABLE, 6]]);
  assert.notEqual(named[0].reasonText, generic[0].reasonText,
    'THE SIXTH ELEMENT REACHED THE WIRE AND DID NOT REACH THE PLAYER. The badge still reads the '
    + 'generic sentence with the answer sitting in the row — a decoder that reads five elements by '
    + 'index keeps working and drops the field, silently, with every other test green.');
  assert.match(named[0].reasonText, /NEEDS CONTROLLER MODULE/,
    'the badge must NAME the item, in the sim\'s own words');
  assert.match(named[0].label, /NEEDS CONTROLLER MODULE/,
    'the <title> label composes from the same sentence — one wording per row, not two');

  // …and it reaches the VISIBLE key, which is what discharges "the player was never told".
  assert.match(blockedKeyHtml(named), /NEEDS CONTROLLER MODULE/,
    'the sentence stopped at the <title>: a hover nobody knows to try and that does not exist on a '
    + 'touch device is the same silence one layer down');

  // THE SECOND CLAUSE IS LOAD-BEARING AND IS ASSERTED, NOT ASSUMED. The host emits this row only
  // when NONE of Parts/Seals/Swarf is aboard, so any of them clears it; a bare "NEEDS X" would read
  // as "X is the only key", which is false about the ship.
  assert.match(named[0].reasonText, /NOTHING ABOARD/,
    'the sentence names one item but must not imply it is the only one that would clear the row');
});

// ⭐ THE CHARTER'S MUTATION 2 — "return the refusal with a `Detail` the client cannot name".
// APPLY: emit `(int)ItemKind.Ice` (8) from `AddUnfixableRow` ⇒ this client has no word for it and
// the badge must fall back to the generic sentence rather than render `undefined`.
test('M3-13 mutation 2: an UNNAMEABLE detail degrades to the generic sentence, never `undefined`', () => {
  const at = [ROOM.rx + 1, ROOM.ry + 1];
  for (const detail of [0, 8, 99, -7, BLOCKED_DETAIL_NONE]) {
    const [tile] = fold([[at[0], at[1], ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_NO_CONSUMABLE, detail]]);
    assert.equal(tile.reasonText, BLOCKED_REASON_TEXT.no_consumable,
      `detail ${detail} is not a word this client knows, so the badge must keep the reason's own `
      + 'generic sentence — still true, only less specific. That is the forward-compat path the '
      + 'whole channel is built on: the payload of a blocked row is THIS TILE IS STUCK.');
    assert.ok(!/undefined|NaN|null/i.test(tile.reasonText + ' ' + tile.label),
      'a badge reading "NEEDS UNDEFINED" is worse than the sentence it replaced: ' + tile.reasonText);
  }
  // …and the unnameable-REASON path still degrades one step further, unchanged by any of this.
  const [unknown] = fold([[at[0], at[1], ROOM.deck, BLOCKED_ORDER_DIG, 98, 6]]);
  assert.match(unknown.reasonText, /REASON UNKNOWN TO THIS CLIENT/,
    'a reason this client cannot name must still draw a badge with words — a detail it CAN name '
    + 'must not accidentally rescue a reason it cannot');
});

// ⭐ blockedReasonSentence IS THE ONE ENTRY POINT, and this is the leg that keeps it one.
// MUTATION: make `roomBlockedTiles` index `BLOCKED_REASON_TEXT` again ⇒ mutation 1's test reddens.
test('blockedReasonSentence: pure, total, and the same answer roomBlockedTiles renders', () => {
  assert.equal(blockedReasonSentence('air'), BLOCKED_REASON_TEXT.air);
  assert.equal(blockedReasonSentence('air', 6), BLOCKED_REASON_TEXT.air,
    'a reason with no detail wording ignores the detail rather than inventing one');
  assert.equal(blockedReasonSentence(''), '', 'an unnameable reason answers empty, not undefined');
  assert.equal(blockedReasonSentence(undefined), '');
  assert.equal(blockedReasonSentence('no_such_reason', 6), '');
  // ⚠️ AN INHERITED KEY IS NOT A REASON. A frozen object literal still inherits `Object.prototype`,
  // so a bare index would answer `Object` for 'constructor' — a FUNCTION, which this call would then
  // invoke, returning a truthy Number wrapper straight onto a player's badge. Both tables are read
  // through `hasOwnProperty` for that reason.
  // MUTATION: drop the `hasOwnProperty` guards in `blockedReasonSentence` ⇒ red on both legs.
  for (const evil of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(blockedReasonSentence(evil, 6), '',
      `an inherited key ('${evil}') was treated as a reason name`);
  }
  assert.match(blockedReasonSentence('no_consumable', 5), /NEEDS PARTS/);
  assert.match(blockedReasonSentence('no_consumable', 7), /NEEDS SEALS/);
});

// ⭐ THE KEY BOX DEDUPES ON THE SENTENCE, NOT ON THE REASON CODE — added by M3-13 because `detail`
// makes two rows share a code and say two different true things. Keyed on the code alone the box
// prints the FIRST and swallows the second, so the badges on the floor and the words beside them
// disagree about the same room — which is exactly what deriving both from one `roomBlockedTiles`
// call is supposed to make impossible.
// MUTATION: key `seen` on `t.reasonName` alone in `blockedKeyHtml` ⇒ red (one row, not two).
test('two rows with ONE reason code but two different sentences get TWO key rows', () => {
  const tiles = fold([
    [ROOM.rx, ROOM.ry, ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_NO_CONSUMABLE, 5],   // Parts
    [ROOM.rx + 1, ROOM.ry, ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_NO_CONSUMABLE, 6], // Ctrl module
  ]);
  const html = blockedKeyHtml(tiles);
  assert.equal((html.match(/rz-key-row/g) || []).length, 2,
    'the key box collapsed two DIFFERENT sentences into one row because they share a reason code — '
    + 'the player is told about one stuck order and not the other');
  assert.match(html, /NEEDS PARTS/);
  assert.match(html, /NEEDS CONTROLLER MODULE/);
  assert.equal((html.match(/rz-key-sw-blocked-no_consumable/g) || []).length, 2,
    'the SWATCH is still per-reason: both rows carry the no_consumable hook, because there is one '
    + 'colour per reason and not one per sentence');
});

// ═══════════════════════════════════════════════════════════ roomBlockedTiles — BLINDED LEGS

/** One row, positioned relative to ROOM. */
const row = (x, y, deck = ROOM.deck, order = BLOCKED_ORDER_DIG, reason = BLOCKED_REASON_AIR) =>
  [x, y, deck, order, reason];

const fold = (cells) => roomBlockedTiles(decodeBlocked(msg(cells)), ROOM);

test('roomBlockedTiles keeps an in-room row and composes its label', () => {
  const out = fold([row(ROOM.rx + 1, ROOM.ry + 1, ROOM.deck, BLOCKED_ORDER_BUILD, BLOCKED_REASON_AIR)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].tx, ROOM.rx + 1);
  assert.equal(out[0].ty, ROOM.ry + 1);
  assert.equal(out[0].orderName, 'build');
  assert.equal(out[0].reasonName, 'air');
  assert.equal(out[0].reasonText, BLOCKED_REASON_TEXT.air,
    'the wording must come from the ONE table in messages.js, not be written again here');
  assert.equal(out[0].label, 'BUILD BLOCKED — ' + BLOCKED_REASON_TEXT.air);
});

// LEG 1, ALONE. The wrong-deck row is otherwise IN the rect, so nothing but the deck filter can
// reject it — and it is the ONLY row, so a dead filter is visible as a length of 1 rather than
// folding invisibly into a neighbour (the fifth trap shape's exact fixture mistake).
// MUTATION: delete the deck test in roomBlockedTiles ⇒ red here and GREEN in the other two legs.
test('LEG deck, BLINDED: a row on another deck is rejected, and it is the only row', () => {
  const out = fold([row(ROOM.rx + 1, ROOM.ry + 1, ROOM.deck + 1)]);
  assert.deepEqual(out, [], 'a blocked order on ANOTHER DECK was drawn in this room');
});

// LEG 2, ALONE.
// MUTATION: delete the `tx < rx || tx >= x1` test ⇒ red here and GREEN in the other two legs.
test('LEG x-range, BLINDED: rows one tile past each horizontal edge are rejected, alone', () => {
  assert.deepEqual(fold([row(ROOM.rx - 1, ROOM.ry + 1)]), [], 'a row one tile LEFT of the room was kept');
  assert.deepEqual(fold([row(ROOM.rx + ROOM.rw, ROOM.ry + 1)]), [], 'a row one tile RIGHT of the room was kept');
});

// LEG 3, ALONE.
// MUTATION: delete the `ty < ry || ty >= y1` test ⇒ red here and GREEN in the other two legs.
test('LEG y-range, BLINDED: rows one tile past each vertical edge are rejected, alone', () => {
  assert.deepEqual(fold([row(ROOM.rx + 1, ROOM.ry - 1)]), [], 'a row one tile ABOVE the room was kept');
  assert.deepEqual(fold([row(ROOM.rx + 1, ROOM.ry + ROOM.rh)]), [], 'a row one tile BELOW the room was kept');
});

// The corners are the tiles an off-by-one on either bound reaches first, and both legs above use
// mid-edge tiles, so this is not covered by them.
test('the room rect is inclusive of all four corner tiles', () => {
  const corners = [
    [ROOM.rx, ROOM.ry], [ROOM.rx + ROOM.rw - 1, ROOM.ry],
    [ROOM.rx, ROOM.ry + ROOM.rh - 1], [ROOM.rx + ROOM.rw - 1, ROOM.ry + ROOM.rh - 1],
  ];
  assert.equal(fold(corners.map(([x, y]) => row(x, y))).length, 4,
    'a corner tile of the room was excluded — an off-by-one on a bound');
});

// MUTATION: delete the `seen` set ⇒ red (two badges and two scrims stack on one tile).
test('two rows on ONE tile fold to one badge — the host does not arbitrate, this does', () => {
  const t = [ROOM.rx + 2, ROOM.ry + 2];
  const out = fold([
    row(t[0], t[1], ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR),
    row(t[0], t[1], ROOM.deck, BLOCKED_ORDER_STRIP, BLOCKED_REASON_NO_APPROACH),
  ]);
  assert.equal(out.length, 1, 'two rows on one tile produced two badges — they would stack');
  assert.equal(out[0].orderName, 'dig', 'the FIRST row wins, matching the host emission order');
});

test('a row this client cannot name is still DRAWN, with an honest text', () => {
  const out = fold([row(ROOM.rx + 1, ROOM.ry + 1, ROOM.deck, 99, 98)]);
  assert.equal(out.length, 1, 'an unnameable row was dropped — silence again');
  assert.match(out[0].reasonText, /UNKNOWN/,
    'the fallback must SAY it does not know, not silently reuse another reason\'s sentence');
});

// ═══════════════════════════════════════════════════════════════════ the SVG, to the character

test('blockedCellSvg draws BOTH FLOOR marks and carries the reason in a class and a title', () => {
  const svg = blockedCellSvg('air', 'DIG BLOCKED — NO AIR', 0, 0, 32, 32);
  assert.match(svg, /class="rz-blocked rz-blocked-air"/, 'the reason class hook is missing');
  assert.match(svg, /<title>DIG BLOCKED — NO AIR<\/title>/, 'the tooltip text is missing');
  assert.match(svg, /class="rz-blocked-scrim"/, 'the DIM half is missing — the tile would not read as inert');
  // ⭐ VR-P3 — THE SECOND FLOOR MARK IS THE OXBLOOD DASHED OUTLINE (ruling E4: "blocked/D5 badge →
  // oxblood dashed outline + leader label, bench-ghost idiom"). The ⚠ plate left the cell entirely —
  // it stands UPRIGHT with a leader now (`blockedBadgeSvg`), because a ⚠ sheared into a
  // cabinet-oblique parallelogram is a smear. Both halves are asserted, here and one test down.
  assert.match(svg, /class="rz-blocked-ring"[^/]*stroke="#7B2C22"/,
    'the refusal outline is missing or is not the ONE ACCENT — a blocked order would look like an '
    + 'ordinary one');
  assert.match(svg, /class="rz-blocked-ring"[^/]*stroke-dasharray="8 5"/,
    'the refusal outline is not in the charter\'s queued-order dash');
  assert.ok(!svg.includes('rz-blocked-badge'),
    'the ⚠ plate is still inside the FLOOR cell — sheared into the floor plane it is unreadable, '
    + 'which is why it moved to `blockedBadgeSvg`');
});

// MUTATION: drop the leader `<path class="rz-blocked-leader">` ⇒ RED. That is the half ruling E4
// names by hand: a badge with no leader is a mark floating over a room, and the player has to guess
// which tile it is about.
test('blockedBadgeSvg stands UPRIGHT, draws its ⚠ as PATHS, and leads back to its tile', () => {
  const svg = blockedBadgeSvg('no_route', 'NO WAY TO WALK TO IT', 32);
  assert.match(svg, /class="rz-blocked-badge rz-blocked-badge-no_route"/, 'the reason class hook is missing');
  assert.match(svg, /class="rz-blocked-leader"[^/]*stroke="#7B2C22"/,
    'the badge has no oxblood leader — nothing ties the words to the tile they are about');
  assert.match(svg, /class="rz-blocked-say"[^>]*>NO WAY TO WALK TO IT</,
    'D5\'s own sentence is not on the floor — the whole point of the badge is that the player is TOLD');
  assert.match(svg, /paint-order="stroke"/,
    'the label carries no halo, so it is unreadable over the hatch, the grid and the fitting it '
    + 'stands beside');
  // The ⚠ is DRAWN, never set: a fallback face has different advances and a glyph that is missing
  // renders as a box (charter §1).
  assert.ok(!/[\u26A0\u25B3]/.test(svg), 'the ⚠ is a font glyph — it must be paths');
  assert.equal(blockedBadgeSvg('air', 'X', 0), '', 'a degenerate box draws nothing');
});

test('blockedCellSvg escapes its label — a title is markup', () => {
  assert.match(blockedCellSvg('air', '<script>&"', 0, 0, 32, 32),
    /<title>&lt;script&gt;&amp;&quot;<\/title>/);
});

test('blockedCellSvg refuses a degenerate box rather than emitting a zero-size rect', () => {
  assert.equal(blockedCellSvg('air', 'x', 0, 0, 0, 32), '');
  assert.equal(blockedCellSvg('air', 'x', 0, 0, 32, -1), '');
});

// This is the assertion that would have caught the `zone-overlay.js` first draft — a builder that
// returns '' unconditionally with the whole suite green.
// MUTATION: `return ''` at the top of blockedLayerSvg ⇒ red.
test('blockedLayerSvg emits one group per tile, positioned room-locally, and pointer-events ON', () => {
  const tiles = fold([row(ROOM.rx, ROOM.ry), row(ROOM.rx + 2, ROOM.ry + 1)]);
  const svg = blockedLayerSvg(tiles, ROOM);
  assert.equal((svg.match(/class="rz-blocked /g) || []).length, 2, 'one group per blocked tile');
  assert.match(svg, /class="rz-blockeds" pointer-events="visiblePainted"/,
    '`pointer-events="none"` silently disables the <title> tooltip — the zone-overlay finding');
  // The second tile is two tiles right and one down of the room origin: 2*32 = 64, 1*32 = 32.
  assert.ok(svg.includes('x="64.5" y="32.5"'),
    'the room-local transform is wrong — a badge would land on the wrong tile: ' + svg);
  assert.equal(blockedLayerSvg([], ROOM), '', 'no blocked tiles ⇒ no group at all, not an empty <g>');
  assert.equal(blockedLayerSvg(null, ROOM), '');
});

// A `<title>` needs a hover nobody knows to try, can be killed by one attribute three layers up, and
// does not exist on touch. The VISIBLE key is what actually discharges "the player was never told" —
// the finding zone-overlay.js's own header records.
// MUTATION: `return ''` at the top of blockedKeyHtml ⇒ red.
test('blockedKeyHtml counts the stuck orders and gives ONE row per distinct reason', () => {
  const tiles = fold([
    row(ROOM.rx, ROOM.ry, ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR),
    row(ROOM.rx + 1, ROOM.ry, ROOM.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR),
    row(ROOM.rx + 2, ROOM.ry, ROOM.deck, BLOCKED_ORDER_STRIP, BLOCKED_REASON_NO_APPROACH),
  ]);
  const html = blockedKeyHtml(tiles);
  assert.match(html, /3 DIG\/STRIP ORDERS STUCK/,
    'the count is the fact that makes a player look — and the ORDER KINDS are named beside it, in '
    + 'the host\'s emission order, because otherwise the tuple\'s `order` element reaches the player '
    + 'ONLY through a <title> this module\'s own header calls inadequate');
  assert.equal((html.match(/rz-key-row/g) || []).length, 2,
    'three tiles with two distinct reasons must produce TWO rows — one per tile would push the zone '
    + 'key off the canvas and explain nothing');
  assert.match(html, /rz-key-sw-blocked-air/);
  assert.match(html, /rz-key-sw-blocked-no_approach/);
  assert.ok(html.includes(BLOCKED_REASON_TEXT.air));
  assert.equal(blockedKeyHtml([]), '', 'nothing stuck ⇒ no key, so the box can hide');
});

// ⭐ M2-18 — THE CONSUMER CHAIN FOR `work_type_off`, END TO END THROUGH THE SHIPPED MODULES: a wire
// row carrying reason 4 must arrive in the VISIBLE key as WORDS. Under OD-H this is the badge a new
// player meets first — every work type boots off, so the very first order they paint carries it —
// and a badge whose legend row reads "REASON UNKNOWN TO THIS CLIENT" is the silence this channel
// exists to remove, arriving one layer further down.
//
// It is driven through decodeBlocked → roomBlockedTiles → blockedKeyHtml, not asserted against the
// table directly, because the table being right is not the claim: the claim is that the sentence
// reaches the key.
// MUTATION: drop 'work_type_off' from BLOCKED_REASON_NAMES ⇒ red (the name resolves '' and the text
// falls back to UNKNOWN). MUTATION 2: delete the `work_type_off` entry from BLOCKED_REASON_TEXT ⇒
// red the same way, on a different half of the seam. Both were run.
test('a work-type-off row reaches the key as WORDS, and they are M2-20\'s vocabulary', () => {
  const tiles = fold([row(ROOM.rx, ROOM.ry, ROOM.deck, BLOCKED_ORDER_STRIP, BLOCKED_REASON_WORK_TYPE_OFF)]);
  assert.equal(tiles.length, 1, 'premise: the row is in the focused room');
  assert.equal(tiles[0].reasonName, 'work_type_off');
  assert.ok(!/UNKNOWN/.test(tiles[0].reasonText),
    'the client could not name reason 4 — the badge would draw with no explanation, which is the '
    + 'exact failure the channel exists to remove');

  const html = blockedKeyHtml(tiles);
  assert.match(html, /rz-key-sw-blocked-work_type_off/, 'the key row needs its swatch hook');
  assert.ok(html.includes(BLOCKED_REASON_TEXT.work_type_off),
    'the sentence must reach the visible key, not only the <title>');
  // THE VOCABULARY CHECK (M2-20 owns the words). The tile names the SHIP's state — "nobody aboard is
  // assigned that work" — and must not invent a second word for a PAWN's state; `Awaiting orders` is
  // the crew dock's sentence and belongs to M2-20 alone.
  assert.match(BLOCKED_REASON_TEXT.work_type_off, /^NOBODY ABOARD IS ASSIGNED THAT WORK$/,
    'the tile\'s words are fixed by the M2-20 vocabulary agreement: it says what the SHIP has not '
    + 'been told to do, in the same family of words, and invents no third name for it');
  assert.ok(!/AWAITING|IDLE|UNASSIGNED/i.test(BLOCKED_REASON_TEXT.work_type_off),
    'a second vocabulary for one player confusion. M2-20 says "Awaiting orders" on the PERSON; this '
    + 'surface says its half on the TILE, and three packages describing one confusion is how a repo '
    + 'acquires two names for one predicate.');
});

// ⭐⭐ D5 — THE CONSUMER CHAIN FOR `no_route`, END TO END THROUGH THE SHIPPED MODULES, exactly as
// the work_type_off leg above does it: a wire row carrying reason 5 must arrive in the VISIBLE key as
// WORDS. It is the same claim and the same failure mode — a badge whose legend reads "REASON UNKNOWN
// TO THIS CLIENT" is the silence this channel exists to remove, arriving one layer further down —
// and this package's whole point is that the player is TOLD, so a row that renders wordless closes
// nothing.
// MUTATION: drop 'no_route' from BLOCKED_REASON_NAMES ⇒ red (the name resolves '' and the text falls
// back to UNKNOWN). MUTATION 2: delete the `no_route` entry from BLOCKED_REASON_TEXT ⇒ red the same
// way, on the other half of the seam. Both were run.
test('a no-route row reaches the key as WORDS, and they are not no_approach\'s', () => {
  const tiles = fold([row(ROOM.rx, ROOM.ry, ROOM.deck, BLOCKED_ORDER_STRIP, BLOCKED_REASON_NO_ROUTE)]);
  assert.equal(tiles.length, 1, 'premise: the row is in the focused room');
  assert.equal(tiles[0].reasonName, 'no_route');
  assert.ok(!/UNKNOWN/.test(tiles[0].reasonText),
    'the client could not name reason 5 \u2014 the order was dropped silently and the badge explaining it '
    + 'draws with no explanation, which is D5 one layer down');

  const html = blockedKeyHtml(tiles);
  assert.match(html, /rz-key-sw-blocked-no_route/, 'the key row needs its swatch hook');
  assert.ok(html.includes(BLOCKED_REASON_TEXT.no_route),
    'the sentence must reach the visible key, not only the <title>');

  // ⚠️ THE PAIR IS THE VOCABULARY. `no_approach` and `no_route` are two different worlds with two
  // different fixes (dig it out / open the route); if they ever collapse into one sentence the badge
  // stops being actionable, which is the only thing it is for.
  assert.notEqual(BLOCKED_REASON_TEXT.no_route, BLOCKED_REASON_TEXT.no_approach,
    'no_route and no_approach must not say the same thing \u2014 one means there is nowhere to stand, the '
    + 'other means there is and she cannot get there');
  assert.notEqual(BLOCKED_REASON_TEXT.no_route, BLOCKED_REASON_TEXT.unreachable,
    'nor may it borrow the hedged sentence of the LATCHED reason \u2014 this answer is a live pathfinder '
    + 'result, and saying "or the material for it" about it would be a confident lie');
});

test('blockedKeyHtml singularises one order and stays escaped', () => {
  const html = blockedKeyHtml([{ reasonName: 'air', reasonText: '<b>' }]);
  assert.match(html, /1 ORDER STUCK/);
  assert.ok(!html.includes('<b>'), 'the key interpolates model text and must escape it');
});

// The order-kind prefix is written from MODEL TEXT, so it takes the same escape as everything else,
// and a row whose order this client cannot NAME must not put a placeholder word in the title.
// MUTATION: drop the `esc(...)` around the joined kinds ⇒ red on the first assertion.
test('the key title escapes the order kinds and omits an unnameable one', () => {
  // ⚠️ THE FIXTURE IS UPPER-CASE ON PURPOSE. The prefix is upper-cased before it is escaped, so a
  // lower-case `<b>` fixture tests nothing: `'<b>x'.toUpperCase()` is `'<B>X'` and an assertion
  // against the literal `<b>` passes with the escape REMOVED. Measured — that first version of this
  // test survived the mutation it names. (The general shape: a negative control must be written in
  // the casing the code under test actually produces.)
  const html = blockedKeyHtml([{ orderName: '<B>X', reasonName: 'air', reasonText: 'T' }]);
  assert.ok(!html.includes('<B>X'), 'the order-kind prefix is model text and reached the key unescaped');
  assert.ok(html.includes('&lt;B&gt;X'), 'and it must still be SHOWN, escaped, not silently dropped');
  assert.match(blockedKeyHtml([{ orderName: 'ORDER', reasonName: 'air', reasonText: 'T' }]),
    /^<span class="rz-key-title">1 ORDER STUCK</,
    'roomBlockedTiles\' fallback orderName (\'ORDER\') must not print as "1 ORDER ORDER STUCK"');
});

// The stylesheet must actually carry the swatch classes the key emits, or the legend rows are
// invisible boxes. Read from the SHIPPED css, code-only so a commented-out rule cannot satisfy it.
test('every reason the key can emit has a swatch rule in the shipped stylesheet', () => {
  const css = codeOnly(stylesSource());
  for (const name of BLOCKED_REASON_NAMES) {
    assert.ok(css.includes('.rz-key-sw-blocked-' + name),
      `styles.css has no swatch for reason '${name}' — its key row would draw a blank box`);
  }
});

// ══════════════════════════════════════════════ THE SEAM, DRIVEN — not scanned (the binding lesson)

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
class BlkEl extends DomEl {
  constructor(doc, tag) { super(doc, tag); this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  closest() { return null; }
  // ⚠️ THE RIG WAS EXTENDED RATHER THAN THE GUARD WEAKENED (CLAUDE.md trap 4's corollary: if a
  // harness cannot model the thing your guard needs to see, fix the harness). The pawn-ordering
  // assertion needs a ROSTER, `renderRoster` reconciles the console's CREW WATCH rows, and
  // `dom-lite.js` models no sibling API. These two stubs are the whole gap; `dom-lite.js` itself is
  // deliberately NOT edited — it is shared with every other client suite and a parallel lane.
  get firstElementChild() { return null; }
  insertBefore(el) { return this.appendChild(el); }
}
class BlkDoc extends DomDocument {
  constructor() { super(); this.body = new BlkEl(this, 'body'); }
  createElement(tag) { return new BlkEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const blkDoc = new BlkDoc();
for (const id of RZ_IDS) { const e = new BlkEl(blkDoc, 'div'); e._id = id; blkDoc.register(id, e); }
globalThis.document = blkDoc;
globalThis.window = { addEventListener() {}, removeEventListener() {} };

// Resolved AFTER the globals — both modules touch `document` at import time. The rig is rebuilt here
// rather than imported from devices-model.test.js: two lanes editing one test module is the merge
// shape that has already broken this repo once.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":1,"slots":[[0,4,6,12,8,"quarters",5,true,true]]}]}';
const ROOMS_JSON = '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96]]}';
const RECT = roomTileRect(decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON))), 'quarters');

function floorFrame(deck, w = 24, h = 20) {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  return { type: 'frame', deck, w, h, lens: 'none', cells };
}

/** Push a `blocked` payload through the REAL receive path (JSON string → `decode` → the dispatch
 *  hud.js exposes), then force a synchronous repaint by re-entering the room. `scheduleRepaint` is
 *  rAF-coalesced and this rig has no rAF, so re-entry is how a test gets a frame it can read. */
function driveBlocked(cells) {
  Hud.renderBlocked(decode(JSON.stringify({ type: 'blocked', cells })));
  RoomZoom.exitRoom();
  RoomZoom.enterRoom('quarters');
}

function prime() {
  RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));
  Hud.renderFrame(floorFrame(RECT.deck));
}

const layers = () => blkDoc.getElementById('rz-layers').innerHTML;
const keyBox = () => blkDoc.getElementById('rz-zonekey').innerHTML;

// ⭐ THE TEST THIS FILE EXISTS FOR. It is not "is the builder called" — that is the guard the
// `devices` lane shipped, and it let the seam be completely inert with 843/843 green.
test('DRIVEN: a blocked row on the wire CHANGES what the Room Zoom draws', () => {
  assert.ok(RECT && RECT.deck === 1, 'the room fixture did not resolve — the rig is not driving anything');
  prime();

  driveBlocked([]);
  const clean = layers();
  assert.ok(clean.length > 0, 'the Room Zoom drew nothing at all — `enterRoom()` did not repaint, so '
    + 'this rig cannot see the seam and every assertion below would be vacuous');
  assert.ok(!clean.includes('rz-blocked'),
    'a badge is drawn with NOTHING on the channel — the layer is not reading the channel');

  const t = [RECT.rx + 1, RECT.ry + 1];
  driveBlocked([[t[0], t[1], RECT.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR]]);
  const stuck = layers();
  assert.notEqual(stuck, clean, 'the drawn output did not change when the channel gained a row');
  assert.ok(stuck.includes('rz-blocked-air'),
    'the reason did not reach the drawn output — a badge with no reason is the old silence with a '
    + 'new icon');
  assert.ok(stuck.includes(BLOCKED_REASON_TEXT.air),
    'the player-facing sentence is not in the markup, so nothing on screen says why');

  // …and it CLEARS. A layer that only ever grows would keep the badge after the room was vented,
  // which is the same lie pointed the other way.
  driveBlocked([]);
  assert.ok(!layers().includes('rz-blocked'),
    'the badge survived the row leaving the channel — the layer latched instead of following it');
});

// MUTATION: change the reason on the wire and this must follow. A constant-reason layer passes the
// test above and fails this one.
test('DRIVEN: the badge follows the REASON, not merely the presence of a row', () => {
  prime();
  const t = [RECT.rx + 2, RECT.ry + 1];

  driveBlocked([[t[0], t[1], RECT.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR]]);
  assert.ok(layers().includes('rz-blocked-air'));
  assert.ok(keyBox().includes(BLOCKED_REASON_TEXT.air), 'the visible key did not name the reason');

  driveBlocked([[t[0], t[1], RECT.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_NO_APPROACH]]);
  const after = layers();
  assert.ok(after.includes('rz-blocked-no_approach'), 'the second reason did not reach the layer');
  assert.ok(!after.includes('rz-blocked-air'), 'the first reason is still drawn — the fold latched');
  assert.ok(keyBox().includes(BLOCKED_REASON_TEXT.no_approach),
    'the visible key kept the OLD wording, so the words and the badge now disagree');
});

// ⭐ THE NEW REASON, DRIVEN END TO END on this side of the seam. `unreachable` is the third
// question the host now asks ("has any crew member managed to start work here?"), and it reaches the
// player only if all four of the decode, the name table, the sentence table and the stylesheet agree.
// The two assertions about WORDING are not decoration: the host's answer is `IsBackedOff`, which means
// "a claim was attempted and failed", so a sentence that promised "this tile is unreachable" would be
// a stronger claim than the sim ever makes — and one of its five carriers is about the MATERIAL, not
// the tile.
// MUTATION: remove 'unreachable' from BLOCKED_REASON_NAMES ⇒ red here (the badge class degrades to
// bare `rz-blocked` and the key falls back to "REASON UNKNOWN TO THIS CLIENT") and red in the
// vocabulary pin above. MUTATION 2: delete BLOCKED_REASON_TEXT.unreachable ⇒ red on the key.
test('DRIVEN: an `unreachable` row draws its own badge and its own words', () => {
  prime();
  const t = [RECT.rx + 3, RECT.ry + 2];
  driveBlocked([[t[0], t[1], RECT.deck, BLOCKED_ORDER_BUILD, BLOCKED_REASON_UNREACHABLE]]);

  const svg = layers();
  assert.ok(svg.includes('rz-blocked-unreachable'),
    'a reason-3 row did not reach the drawn layer with its own class — the client cannot name the '
    + 'reason the host is now able to give it');
  assert.ok(!svg.includes('rz-blocked-no_approach'),
    'reason 3 drew as no_approach: the two are adjacent in meaning and must not collapse');

  const key = keyBox();
  assert.ok(key.includes(BLOCKED_REASON_TEXT.unreachable), 'the visible key did not name the reason');
  assert.ok(!key.includes('REASON UNKNOWN TO THIS CLIENT'),
    'the client fell back to its unknown-reason wording for a reason it now ships');
  assert.ok(/BUILD ORDERS? STUCK/.test(key), 'the key title lost the order kind');

  // THE WORDING IS PART OF THE CONTRACT. `IsBackedOff` is "a claim was attempted and failed", and one
  // of its carriers is BuildJobSource._matRetryAt — the crew could not reach the MATERIAL, not the
  // tile. A sentence claiming the tile is unreachable would be a stronger claim than the sim makes.
  assert.ok(!/UNREACHABLE/.test(BLOCKED_REASON_TEXT.unreachable),
    'the player-facing sentence asserts UNREACHABLE, which is stronger than what the host can know');
  assert.ok(/MATERIAL/.test(BLOCKED_REASON_TEXT.unreachable),
    'the sentence does not cover the build-material carrier (`BuildJobSource._matRetryAt`), which '
    + 'fires when the crew cannot reach the MATERIAL rather than the site. ⚠️ It is NOT the carrier '
    + 'the 480 000-tick stall trips — an earlier draft of this message said so and '
    + 'hosts/web/WireFormat.Blocked.cs retracts it in the same commit: when material IS reachable '
    + 'the claim succeeds and the abandon path records no back-off at all.');
});

// The key box is shared with the zone legend and used to be hidden whenever there were no ZONES.
// Nearly every room has no stockpile, so that would have hidden the blocked legend almost always.
// MUTATION: restore `hidden = !zoneKeyHtml(...)` in paintZoneKey ⇒ red.
test('DRIVEN: the key box is shown for blocked orders even in a room with no zones', () => {
  prime();
  driveBlocked([[RECT.rx, RECT.ry, RECT.deck, BLOCKED_ORDER_BUILD, BLOCKED_REASON_AIR]]);
  const box = blkDoc.getElementById('rz-zonekey');
  assert.equal(box.hidden, false,
    'the key box is hidden. This room has no stockpile zone, and before this channel the box was '
    + 'hidden whenever the ZONE legend was empty — which is nearly every room, so the words '
    + 'explaining the badges would never be seen.');
  assert.match(box.innerHTML, /1 BUILD ORDER STUCK/,
    'the visible key must name WHICH order is stuck — the `order` tuple element otherwise reaches '
    + 'the player only through a <title>');
});

// ⚠️ ADDED AFTER A MUTATION SURVIVED (independent review, J25). Dropping `notifyShip()` from
// `renderBlocked` in hud.js left the whole suite green, because every test above forces its repaint
// with `exitRoom()/enterRoom()` and so never exercises the notify path at all. It is the exact hole
// the `marks` lane closed for `renderMarks` (client/test/room-model.test.js) and it matters for the
// same reason: `GameSession.Send` DEDUPES, so on a quiet ship this payload is sent ONCE — a badge
// that arrived while nothing else moved would sit in the cache, invisible, until some unrelated
// channel happened to change. Silence again, one layer further out.
//
// NOTHING ELSE IS DISPATCHED, and the repaint is the SHIPPING coalesced one (`scheduleRepaint` falls
// back to setTimeout(…,16) with no rAF), not a re-entry.
// MUTATION: `export function renderBlocked(m) { _blocked = m; }` in hud.js ⇒ RED.
test('a blocked dispatch ALONE repaints the surface — the cache is not enough', async () => {
  prime();
  driveBlocked([]);                                   // enter the room, nothing stuck
  // ⚠️ FLUSH FIRST, AND THIS LINE IS THE TEST. `enterRoom()` repaints synchronously AND schedules a
  // coalesced one; that pending timer would fire ~16 ms later — i.e. AFTER the dispatch below — and
  // repaint from the cache with no notification involved at all. Measured: without this wait the
  // mutation named below SURVIVED, and the test read as a perfectly convincing guard.
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(!layers().includes('rz-blocked'), 'precondition: nothing is badged yet');

  Hud.renderBlocked(decode(JSON.stringify({
    type: 'blocked',
    cells: [[RECT.rx + 3, RECT.ry + 1, RECT.deck, BLOCKED_ORDER_STRIP, BLOCKED_REASON_NO_APPROACH]],
  })));
  await new Promise((r) => setTimeout(r, 60));        // the coalesced repaint

  assert.ok(layers().includes('rz-blocked'),
    'a `blocked` message reached the cache and the Room Zoom never repainted. The channel is deduped '
    + 'by GameSession.Send, so on a quiet ship it is sent ONCE — the badge explaining a stuck order '
    + 'would then never appear until some unrelated channel moved.');
  driveBlocked([]);
});

// The wrong-deck row is the one a careless fixture misses (the fifth trap shape), so it is driven too
// rather than only unit-tested against the fold.
test('DRIVEN: a row on another deck does not reach the drawn layer', () => {
  prime();
  driveBlocked([[RECT.rx, RECT.ry, RECT.deck + 1, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR]]);
  assert.ok(!layers().includes('rz-blocked'), 'another deck\'s blocked order was drawn in this room');
});

// The whole design of the layer is that it is ADDITIVE — telling the player their order VANISHED is
// a worse lie than the silence being fixed.
//
// ⚠️ IT PINS BOTH SIDES OF THE SANDWICH, and the upper half was a send-back: `roomzoom-view.js`
// states "STILL BELOW `pawnSvg` … a crew member is never hidden by a layer that is explaining the
// floor" as load-bearing, `blocked-overlay.js` repeats the argument, and NOTHING TESTED IT — moving
// `blockedLayerSvg` after `pawnSvg` left all 27 node tests green while a near-black scrim washed over
// every pawn standing on a blocked tile (which they do: the grid crew cluster on the hold's dig
// field, and the committed shots show crew sitting partly over badges).
//
// MUTATION A: have blockedLayerSvg replace the mark layer instead of overlaying it ⇒ red.
// MUTATION B: move `body += blockedLayerSvg(...)` AFTER `body += pawnSvg(...)` ⇒ red on the last leg.
test('DRIVEN: the blocked layer is ADDITIVE — over the mark, under the pawns', () => {
  prime();
  const t = [RECT.rx + 1, RECT.ry + 2];
  // A crew member standing ON the blocked tile — the case the ordering guarantee is about.
  Hud.renderRoster({
    type: 'roster',
    crew: [{ id: 1, name: 'ADA', deck: RECT.deck, x: t[0], y: t[1], task: 'None' }],
  });
  Hud.renderMarks(decode(JSON.stringify({ type: 'marks', cells: [[t[0], t[1], RECT.deck, 1]] })));
  driveBlocked([[t[0], t[1], RECT.deck, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR]]);
  const svg = layers();
  assert.ok(svg.includes('mk mk-dig'),
    'the DIG mark vanished under the blocked badge. The order is still queued; drawing it away tells '
    + 'the player it was cancelled, which is worse than not explaining it.');
  assert.ok(svg.includes('rz-blocked'), 'and the badge must be there too, or this proves nothing');
  assert.ok(svg.indexOf('mk mk-dig') < svg.indexOf('rz-blocked'),
    'the scrim must be drawn ABOVE the order mark — under it, the amber ring sits at full brightness '
    + 'on a tile that is going nowhere, which is the misreading the layer exists to prevent');
  assert.ok(svg.includes('rz-pawns'),
    'no pawn layer in the output — the ordering assertion below would be vacuous (indexOf(-1))');
  assert.ok(svg.indexOf('rz-blocked') < svg.indexOf('rz-pawns'),
    'the blocked layer is drawn ABOVE the pawns, so a near-black scrim washes over every crew member '
    + 'standing on a blocked tile. Both view files state this ordering as load-bearing: a layer that '
    + 'explains the floor must never hide a person.');
});

// ═════════════════════════════════════════════════════════════════════ the scan controls, both ways

test('NEGATIVE CONTROL: the host constants named only in a COMMENT do not satisfy the pin', () => {
  const stripped = codeOnly('// public const int ReasonAir = 41;\npublic const int ReasonAir = 0;\n');
  assert.ok(!stripped.includes('41'),
    'codeOnly did not strip a line comment, so the vocabulary pin above could be satisfied by prose');
  assert.match(stripped, /public const int ReasonAir\s*=\s*0\s*;/, 'and the real code survived');
});

test('POSITIVE CONTROL: the same declaration in real code IS seen', () => {
  const stripped = codeOnly('public const int ReasonNoApproach = 7;');
  assert.match(stripped, /ReasonNoApproach\s*=\s*7/,
    'codeOnly ate real code — every source scan in this file is then measuring nothing');
});
