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
  BLOCKED_ORDER_DIG, BLOCKED_ORDER_STRIP, BLOCKED_ORDER_BUILD,
  BLOCKED_REASON_AIR, BLOCKED_REASON_NO_APPROACH, BLOCKED_REASON_NO_CONSUMABLE,
  BLOCKED_REASON_UNREACHABLE, BLOCKED_REASON_WORK_TYPE_OFF,
} from '../src/wire/messages.js';
import { roomBlockedTiles, roomTileRect } from '../src/ui/room-model.js';
import { blockedCellSvg, blockedLayerSvg, blockedKeyHtml } from '../src/ui/blocked-overlay.js';
import { decksView } from '../src/ui/decks-model.js';
import { codeOnly } from './code-only.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';

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
test('the wire tuple order is [x, y, deck, order, reason] on BOTH sides of the seam', () => {
  const emitted = [...WIRE_BLOCKED_CS.matchAll(/\.Append\(c\.(\w+)\.ToString\(BlockedIc\)\)/g)].map((m) => m[1]);
  assert.deepEqual(emitted, ['X', 'Y', 'Deck', 'Order', 'Reason'],
    'hosts/web/WireFormat.Blocked.cs no longer appends the tuple in the order this client reads it. '
    + 'The tuple is POSITIONAL — a swap reports a dig as a strip, or "no approach" as "no air" — and '
    + 'there is no compiler across this seam.');

  const ctor = /BlockedCell\(int (\w+), int (\w+), int (\w+), int (\w+), int (\w+)\)/.exec(WIRE_BLOCKED_CS);
  assert.ok(ctor, 'the BlockedCell constructor was not found — this parse has rotted, and the append '
    + 'scan alone cannot see a CALLER that fills the fields in the wrong order');
  assert.deepEqual(ctor.slice(1, 6), ['x', 'y', 'deck', 'order', 'reason']);
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
  assert.equal(constOf('ReasonAir'), BLOCKED_REASON_AIR);
  assert.equal(constOf('ReasonNoApproach'), BLOCKED_REASON_NO_APPROACH);
  assert.equal(constOf('ReasonNoConsumable'), BLOCKED_REASON_NO_CONSUMABLE);
  assert.equal(constOf('ReasonUnreachable'), BLOCKED_REASON_UNREACHABLE);
  assert.equal(constOf('ReasonWorkTypeOff'), BLOCKED_REASON_WORK_TYPE_OFF);

  // The NAME tables are indexed BY the wire value, so a hole or a reorder mis-labels every badge.
  assert.deepEqual(BLOCKED_ORDER_NAMES, ['dig', 'strip', 'build']);
  assert.deepEqual(BLOCKED_REASON_NAMES,
    ['air', 'no_approach', 'no_consumable', 'unreachable', 'work_type_off']);
  for (const name of BLOCKED_REASON_NAMES) {
    assert.ok(BLOCKED_REASON_TEXT[name], `reason '${name}' has no player-facing sentence — a badge `
      + 'with no words is the silence this channel exists to remove, wearing a new costume');
  }
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
  const out = decodeBlocked(msg([[5, 6, 1, BLOCKED_ORDER_STRIP, BLOCKED_REASON_AIR]]));
  assert.deepEqual(out, [{
    x: 5, y: 6, deck: 1, order: 1, reason: 0, orderName: 'strip', reasonName: 'air',
  }]);
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

test('blockedCellSvg draws BOTH marks and carries the reason in a class and a title', () => {
  const svg = blockedCellSvg('air', 'DIG BLOCKED — NO AIR', 0, 0, 32, 32);
  assert.match(svg, /class="rz-blocked rz-blocked-air"/, 'the reason class hook is missing');
  assert.match(svg, /<title>DIG BLOCKED — NO AIR<\/title>/, 'the tooltip text is missing');
  assert.match(svg, /class="rz-blocked-scrim"/, 'the DIM half is missing — the tile would not read as inert');
  assert.match(svg, /class="rz-blocked-badge"/, 'the badge is missing — the tile would not say WHY');
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
  const css = codeOnly(read(join(CLIENT, 'styles.css')));
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
