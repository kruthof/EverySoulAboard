// THE ZONE OVERLAY'S MARKUP — the half of WP-3 that was completely untested, and the reason it is now
// its own module.
//
// WHAT THIS FILE EXISTS TO STOP. With the SVG builder living inside `roomzoom-view.js` (untestable —
// there is no DOM in this suite) the only guard was a source scan proving the function was CALLED.
// Independently measured on the first draft: making it `return ''` unconditionally left **546/546
// passing**, and emitting no `<title>` at all left **546/546 passing**. A package whose whole purpose is
// "the player can be told" had zero assertions that anything is drawn. Every test below is written so
// that one of those two mutations reddens it.
//
// STRING ASSERTIONS, NOT dom-lite. `client/test/dom-lite.js` is deliberately "exactly the surface
// moss-screen.js touches" and does not parse `innerHTML` at all, so it cannot see inside an assigned
// SVG string; driving `initRoomZoom` under it would mean scaffolding every id in the Room Zoom's
// skeleton to assert on markup that is a plain string anyway. Both builders are PURE string functions
// (the `render/pawn-svg.js` / `ui/deck-minimap.js` / `items/index.js` house pattern), so the markup is
// checkable to the character here — and the fact that the surface actually MOUNTS it is proven where
// that claim really lives: in a real browser, plus the wiring scan in zone-model.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACCEPT_ALL } from '../src/ui/stock-filter-model.js';
import { U } from '../src/ui/room-model.js';
import { ZONE_FLAG_BACKED_OFF } from '../src/wire/messages.js';
import { BACKED_OFF_LABEL, roomZoneTiles, zoneLegendRows } from '../src/ui/zone-model.js';
import { zoneKeyHtml, zoneLayerSvg } from '../src/ui/zone-overlay.js';

const FOCUS = { deck: 0, rx: 10, ry: 5, rw: 4, rh: 3 };
const row = (x, y, mask, flags) => ({ x, y, deck: 0, mask, flags });
const tilesFor = (...rows) => roomZoneTiles(rows, FOCUS);

/** Count non-overlapping matches — a presence regex says "at least one", which is not the claim. */
const count = (s, re) => (s.match(re) || []).length;

// ═════════════════════════════════════════════════════════════════════ the floor layer

// MUTATION: `return ''` unconditionally ⇒ fails. This is the mutation that left 546/546 green.
test('zoneLayerSvg draws one group per zoned tile, inside the rz-zones layer', () => {
  const svg = zoneLayerSvg(tilesFor(
    row(10, 5, ACCEPT_ALL, 0), row(11, 5, ACCEPT_ALL, 0), row(12, 6, ACCEPT_ALL, 0),
  ), FOCUS);

  assert.ok(svg.length > 0, 'the layer must not be empty for a room that HAS zones');
  assert.equal(count(svg, /<g class="rz-zones"/g), 1, 'exactly one layer group wraps them all');
  assert.equal(count(svg, /<g class="rz-zone[" ]/g), 3, 'one group per tile');
  assert.equal(count(svg, /<rect /g), 3, 'one tint rect per tile, and no more');
  assert.ok(svg.endsWith('</g>'), 'the layer group is closed');
});

// MUTATION: drop the `<title>` element ⇒ fails. The OTHER mutation that left 546/546 green.
test('every tile group carries its wording as a <title>', () => {
  const svg = zoneLayerSvg(tilesFor(
    row(10, 5, ACCEPT_ALL, 0),
    row(11, 5, 1 << 3, 0),
    row(12, 5, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF),
    row(13, 5, 1 << 3, ZONE_FLAG_BACKED_OFF),
  ), FOCUS);

  const titles = [...svg.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  assert.deepEqual(titles, [
    'ACCEPTS ALL', 'FOOD', BACKED_OFF_LABEL, BACKED_OFF_LABEL + ' · FOOD',
  ], 'the <title> must carry zoneLabel verbatim — including BOTH facts on a both-tile');
  // A title outside its group would attach to the layer, not the tile: pin that each group has one.
  assert.equal(count(svg, /<g class="rz-zone[" ][^>]*><title>/g), 4,
    'the <title> must be the FIRST child of its own tile group, or the browser attaches it elsewhere');
});

// MUTATION: swap the wedge and hatch so both are the amber ALARM colour ⇒ fails. That was the shipped
// state: an amber wedge on an amber hatch inside an amber ring, i.e. one smear on exactly the tile a
// player most needs to read.
test('the restricted wedge and the back-off hatch are visually distinguishable', () => {
  const both = zoneLayerSvg(tilesFor(row(10, 5, 1 << 3, ZONE_FLAG_BACKED_OFF)), FOCUS);
  const wedge = /<path class="rz-zone-wedge"[^>]*fill="([^"]+)"/.exec(both);
  const hatch = /<line[^>]*stroke="([^"]+)"/.exec(both);
  assert.ok(wedge && hatch, 'a both-tile must draw BOTH marks');
  assert.notEqual(wedge[1].toLowerCase(), hatch[1].toLowerCase(),
    'the restriction wedge and the back-off hatch must not be the same colour — a tile that is both ' +
    'then reads as one undifferentiated mark');
  // Both marks are present on a both-tile, and each is absent when its fact is.
  assert.equal(count(both, /class="rz-zone-wedge"/g), 1);
  assert.equal(count(both, /class="rz-zone-hatch"/g), 1);
  assert.match(both, /class="rz-zone rz-zone-restricted rz-zone-backedoff"/,
    'the group carries both state classes, so CSS/tests can address either');
});

// MUTATION: emit the wedge for every tile / the hatch for every tile ⇒ fails.
test('each mark appears only on the tile whose fact it states', () => {
  const plain = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, 0)), FOCUS);
  assert.equal(count(plain, /class="rz-zone-wedge"/g), 0, 'an unfiltered tile has no restriction wedge');
  assert.equal(count(plain, /class="rz-zone-hatch"/g), 0, 'a reached tile has no back-off hatch');
  assert.equal(count(plain, /rz-zone-restricted|rz-zone-backedoff/g), 0, 'nor either state class');

  const restrictedOnly = zoneLayerSvg(tilesFor(row(10, 5, 1 << 3, 0)), FOCUS);
  assert.equal(count(restrictedOnly, /class="rz-zone-wedge"/g), 1);
  assert.equal(count(restrictedOnly, /class="rz-zone-hatch"/g), 0);

  const backedOffOnly = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF)), FOCUS);
  assert.equal(count(backedOffOnly, /class="rz-zone-wedge"/g), 0);
  assert.equal(count(backedOffOnly, /class="rz-zone-hatch"/g), 1);
});

// MUTATION: drop the `- focus.rx` / `- focus.ry` from the local transform ⇒ every mark lands off the
// room and this fails. The Room Zoom's layer space is room-local; the model deliberately hands over
// WORLD tile coordinates (the roomCells rule), so this conversion is the overlay's job to get right.
test('tiles are placed in ROOM-LOCAL space, one U per tile', () => {
  const svg = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, 0), row(12, 7, ACCEPT_ALL, 0)), FOCUS);
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
  // (10,5) is the room's origin ⇒ (0,0)+0.5 inset; (12,7) is +2,+2 tiles ⇒ 2U,2U.
  assert.deepEqual(rects, [[0.5, 0.5], [2 * U + 0.5, 2 * U + 0.5]]);
});

test('zoneLayerSvg is empty when there is nothing to draw', () => {
  assert.equal(zoneLayerSvg([], FOCUS), '', 'an unzoned room draws no layer at all');
  assert.equal(zoneLayerSvg(null, FOCUS), '');
  assert.equal(zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, 0)), null), '',
    'no focus ⇒ no local transform ⇒ nothing may be drawn at a guessed position');
});

// The hatch is referenced by `url(#rz-zone-hatch)`; a pattern that is never defined renders as
// nothing, silently. MUTATION: delete the <defs> block ⇒ fails.
test('the hatch pattern it references is actually defined', () => {
  const svg = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF)), FOCUS);
  assert.match(svg, /<pattern id="rz-zone-hatch"/, 'the referenced pattern must be defined');
  assert.ok(svg.indexOf('<pattern id="rz-zone-hatch"') < svg.indexOf('url(#rz-zone-hatch)'),
    'and defined before it is used');
});

// ═══════════════════════════════════════════════════════════════════════════════ the key

// MUTATION: `return ''` ⇒ fails. MUTATION 2: drop the swatch `<i>` ⇒ the rows lose the mark they are
// explaining and this fails.
test('zoneKeyHtml renders one labelled row per legend row, with its swatch', () => {
  const rows = zoneLegendRows(tilesFor(
    row(10, 5, ACCEPT_ALL, 0), row(11, 5, 1 << 3, 0), row(12, 5, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF),
  ));
  const html = zoneKeyHtml(rows);

  assert.equal(count(html, /class="rz-key-row"/g), rows.length, 'one rendered row per legend row');
  assert.equal(count(html, /class="rz-key-sw rz-key-sw-/g), rows.length, 'each row carries its swatch');
  for (const r of rows) {
    assert.ok(html.includes('rz-key-sw-' + r.kind), `the '${r.kind}' swatch class is emitted`);
    assert.ok(html.includes(r.label), `the words "${r.label}" reach the page`);
  }
  // The wording a player most needs is present IN FULL, not truncated to a code.
  assert.ok(html.includes(BACKED_OFF_LABEL),
    'the back-off wording must appear in the key — this is the ONE place it is readable without a ' +
    'tooltip, and a tooltip is exactly what turned out to be unreachable');
});

test('zoneKeyHtml is empty when there is nothing to explain', () => {
  assert.equal(zoneKeyHtml([]), '', 'no rows ⇒ no key ⇒ the caller hides the box');
  assert.equal(zoneKeyHtml(null), '');
});

// ═══════════════════════════════════════════════════════════════════ escaping (both builders)

// Neither builder may trust its input. Today the labels are ASCII from a fixed table, but both
// interpolate MODEL text into markup, and "the input happens to be safe" is not a contract — a future
// label (a room name, a player-typed zone name) walks straight in.
// MUTATION: drop `esc` from either builder ⇒ fails.
test('both builders escape their labels', () => {
  const nasty = 'A<b>&"\'';
  const svg = zoneLayerSvg([{ tx: 10, ty: 5, restricted: false, backedOff: false, label: nasty }], FOCUS);
  assert.ok(svg.includes('A&lt;b&gt;&amp;&quot;&#39;'), 'the <title> text is escaped');
  assert.ok(!/<title>A<b>/.test(svg), 'raw markup reached the <title>');

  const html = zoneKeyHtml([{ kind: 'zone', label: nasty }]);
  assert.ok(html.includes('A&lt;b&gt;&amp;&quot;&#39;'), 'the key row label is escaped');
  assert.ok(!html.includes('<b>'), 'raw markup reached the key');

  // …and the `kind`, which lands in a class attribute.
  assert.ok(!zoneKeyHtml([{ kind: 'x"><script>', label: 'L' }]).includes('<script>'),
    'the swatch kind is interpolated into an attribute and must be escaped too');
});

// NON-VACUITY. Every assertion above rests on the fixture producing tiles at all; a broken
// roomZoneTiles (or focus rect) would make them all trivially true in the empty direction.
test('the fixture really produces tiles', () => {
  const tiles = tilesFor(row(10, 5, 1 << 3, ZONE_FLAG_BACKED_OFF));
  assert.equal(tiles.length, 1, 'the FOCUS rect must actually contain the fixture rows');
  assert.deepEqual([tiles[0].restricted, tiles[0].backedOff], [true, true]);
  assert.ok(U > 1, 'the tile pitch must be a real logical size');
});
