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
import { U, roomScene, scenePlacement } from '../src/ui/room-model.js';
// VR-P3 REVISION — the ORDER RING itself, so "a zone is quieter than an order" is measured against
// the shipped mark rather than against a copy of its weight (review MINOR 1).
import { markCellSvg } from '../src/ui/mark-overlay.js';
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
    'ACCEPTS ALL', 'ACCEPTS FOOD', BACKED_OFF_LABEL, BACKED_OFF_LABEL + ' · ACCEPTS FOOD',
  ], 'the <title> must carry zoneLabel verbatim — including BOTH facts on a both-tile, in the same ' +
     'spelling the key uses');
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
  assert.equal(count(plain, /class="rz-zone-dim"/g), 0, 'nor is a reached tile dimmed');
  assert.equal(count(plain, /rz-zone-restricted|rz-zone-backedoff/g), 0, 'nor either state class');

  const restrictedOnly = zoneLayerSvg(tilesFor(row(10, 5, 1 << 3, 0)), FOCUS);
  assert.equal(count(restrictedOnly, /class="rz-zone-wedge"/g), 1);
  assert.equal(count(restrictedOnly, /class="rz-zone-hatch"/g), 0);
  assert.equal(count(restrictedOnly, /class="rz-zone-dim"/g), 0,
    'a filtered-but-REACHED tile must not be dimmed — the dim means "nothing is arriving", and a ' +
    'zone that is merely picky is working exactly as ordered');

  const backedOffOnly = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF)), FOCUS);
  assert.equal(count(backedOffOnly, /class="rz-zone-wedge"/g), 0);
  assert.equal(count(backedOffOnly, /class="rz-zone-hatch"/g), 1);
  assert.equal(count(backedOffOnly, /class="rz-zone-dim"/g), 1);
});

// WP-6 — the DIM half of plan §5 gap 3 ("the tile renders dim + hatch + a one-line reason"). WP-3
// shipped the hatch and the reason; this is the piece that was specified and not built, and it is the
// whole of WP-6's change to this layer — the rest was EXTENDED, not replaced.
//
// MUTATION: drop the `rz-zone-dim` rect ⇒ fails. MUTATION 2: draw it OVER the hatch and the ring ⇒
// fails on the ordering leg, and in a browser it mutes the one mark that is meant to shout.
test('a backed-off tile is DIMMED as well as hatched, under its own alarm marks', () => {
  const svg = zoneLayerSvg(tilesFor(row(10, 5, 1 << 3, ZONE_FLAG_BACKED_OFF)), FOCUS);
  const dim = /<rect class="rz-zone-dim"[^>]*fill="([^"]+)"/.exec(svg);
  assert.ok(dim, 'a backed-off tile draws no dimming scrim at all');
  // ⭐ VR-P3 — THE SCRIM WASHES **TOWARDS THE GROUND**, AND THE GROUND MOVED. This leg used to read
  // `r + g + b < 150` ("it must be DARK"), which was the correct statement of "reads as inert"
  // against a near-black canvas. The Level-2 floor is PAPER now, so a dark scrim would make the one
  // tile nothing is happening on the LOUDEST thing in the room — the assertion's subject is
  // unchanged and its direction is inverted. Parsed out of the emitted colour rather than restated
  // as a constant both sides import, exactly as before.
  const rgba = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(dim[1]);
  assert.ok(rgba, `the scrim fill ${JSON.stringify(dim[1])} is not an rgba() colour`);
  const [r, g, b, a] = rgba.slice(1).map(Number);
  assert.ok(r + g + b > 600,
    `the scrim is not a PAPER wash (rgb ${r},${g},${b}) — against a paper floor a dark scrim makes `
    + 'the inert tile the loudest thing in the room, which is the opposite of what it is for');
  assert.ok(a > 0.15 && a < 0.85, `the scrim alpha ${a} is either invisible or opaque`);
  // ORDER: under the alarm marks, over the zone tint. The dim says "inert"; the hatch and the wedge
  // say what to DO about it, and muting those would be the wrong half of the tile to darken.
  const iTint = svg.indexOf('stroke-dasharray="2 2"');
  const iDim = svg.indexOf('class="rz-zone-dim"');
  const iHatch = svg.indexOf('class="rz-zone-hatch"');
  const iWedge = svg.indexOf('class="rz-zone-wedge"');
  assert.ok(iTint >= 0 && iHatch > 0 && iWedge > 0, 'the fixture must draw all three or this is vacuous');
  assert.ok(iDim > iTint, 'the scrim must be drawn OVER the zone tint it is dimming');
  assert.ok(iHatch > iDim && iWedge > iDim, 'the alarm marks must be drawn OVER the scrim, not under it');
});

// MUTATION: drop the `- focus.rx` / `- focus.ry` from the local transform ⇒ every mark lands off the
// room and this fails. The Room Zoom's layer space is room-local; the model deliberately hands over
// WORLD tile coordinates (the roomCells rule), so this conversion is the overlay's job to get right.
test('tiles are placed in ROOM-LOCAL space, one U per tile', () => {
  const svg = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, 0), row(12, 7, ACCEPT_ALL, 0)), FOCUS);
  // TRANSLATED at the VR-P3 review: the zone's boundary rect carries `class="rz-zone-edge"` (the
  // weight it is drawn at is now a pinned RELATION against the order ring, so it needs a name).
  // Narrower than the old bare `<rect x=` scan, which would have counted the dim/hatch/wedge rects.
  const rects = [...svg.matchAll(/<rect class="rz-zone-edge" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
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

// ⭐ VR-P3 — THE CELL FILLS THE UNIT IT IS HANDED, and this leg exists because a mutation SURVIVED.
//
// The Room Zoom's tile is ~95 scene px on the cutaway and 32 logical px in the plan view this
// replaced, so every extent in the builder takes `unit`. Reverting ONE of them to the `U` constant
// paints the top-left THIRD of each tile and leaves the whole suite green — found by RENDER, not by
// assertion, which is exactly the gap `marks-shot.mjs`'s header warns about ("a perfectly formed SVG
// string paints nothing if its box is empty"). It is closed here rather than filed.
//
// MUTATION: `const side = unit - 1` → `U - 1` in zoneLayerSvg ⇒ RED.
// MUTATION: hard-code the wedge back to 10/9 units ⇒ RED on the second leg.
test('VR-P3: a zone cell fills the UNIT it is drawn in, at any tile size', () => {
  const big = zoneLayerSvg(tilesFor(row(10, 5, 1 << 3, 0)), FOCUS, null, 96);
  const small = zoneLayerSvg(tilesFor(row(10, 5, 1 << 3, 0)), FOCUS, null, 32);
  const widthOf = (svg) => Number((/width="([\d.]+)"/.exec(svg) || [])[1]);
  assert.equal(widthOf(big), 95, 'the zone tint does not fill a 96-unit cell — on the cutaway it '
    + 'would paint the top-left corner of every tile it is supposed to cover');
  assert.equal(widthOf(small), 31, 'and it must still fill a 32-unit cell — the Overview\'s size');
  // The RESTRICTED wedge scales too, or the one mark that says "this zone refuses things" becomes a
  // speck at room scale.
  const wedge = (svg) => (/class="rz-zone-wedge" d="M([\d.]+) [\d.]+h([\d.]+)v([\d.]+)z"/.exec(svg) || []);
  const wb = wedge(big), ws = wedge(small);
  assert.ok(wb.length && ws.length, 'the wedge could not be parsed — this leg reads nothing');
  assert.ok(Number(wb[2]) > Number(ws[2]) * 2.5,
    'the restricted wedge does not grow with the cell — at room scale it is a speck the player '
    + 'cannot tell from a stray pixel of grid');
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
  // The label needs its OWN element: as a bare text node beside the swatch its wrapped second line
  // started back at the swatch column. MUTATION: drop the span ⇒ fails.
  assert.equal(count(html, /class="rz-key-text"/g), rows.length,
    'each label sits in its own .rz-key-text item, so a wrapped line hangs under the text');
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// VR-P3 REVISION — the two properties this layer had that nothing could see (review MINOR 1 + 8)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐ A ZONE IS QUIETER THAN AN ORDER — the ranking this file's own header claims and the layer
 * inverted.
 *
 * ⛔ MEASURED: the boundary was drawn at `1 * (unit / U)`, which on the cutaway's ~95 px tile is
 * **2.97 px**, against the **1.5 px** the shared order ring is drawn at on the tile beside it. So the
 * quietest thing on the floor out-shouted every queued order in the room by 2×, and under ruling E3 —
 * one accent, nothing distinguished by hue — WEIGHT was the only signal the player had left.
 *
 * BOTH SIDES ARE READ OUT OF THE SHIPPED BUILDERS at the SAME unit, never from a literal, so raising
 * the order ring cannot silently re-invert the pair.
 *
 * MUTATION: `ZONE_EDGE_W` → `1 * k` (the old expression) ⇒ RED at any unit above 48.
 */
test('VR-P3: the zone boundary is drawn no heavier than the order ring beside it, at any tile size', () => {
  const strokeOf = (svg, re) => Number(re.exec(svg)[1]);
  const fails = [];
  for (const unit of [32, 64, 95, 128]) {
    const zone = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, 0)), FOCUS, null, unit);
    const order = markCellSvg('dig', 0, 0, unit, unit, 0);
    const zw = strokeOf(zone, /<rect class="rz-zone-edge"[^>]*stroke-width="([\d.]+)"/);
    const ow = strokeOf(order, /class="mk-order-ring"[^>]*stroke-width="([\d.]+)"/);
    if (!(zw <= ow)) {
      fails.push(`unit ${unit}: the zone boundary is ${zw} px against the order ring's ${ow} px. A `
        + 'zone is not an order; it carries no accent at all under E3, so if it is also the heavier '
        + 'line there is nothing left to tell the player which mark is the one to act on.');
    }
  }
  assert.deepEqual(fails, [], fails.join('\n'));
  // NON-VACUITY, an INCLUSION test: the two parses really found two different numbers, so `zw <= ow`
  // is not being satisfied by both sides reading NaN or by both reading the same constant.
  const z = zoneLayerSvg(tilesFor(row(10, 5, ACCEPT_ALL, 0)), FOCUS, null, 95);
  assert.match(z, /<rect class="rz-zone-edge"[^>]*stroke-width="[\d.]+"/, 'the boundary parse found nothing');
  assert.match(markCellSvg('dig', 0, 0, 95, 95, 0), /class="mk-order-ring"[^>]*stroke-width="[\d.]+"/,
    'the order-ring parse found nothing');
});

/**
 * ⭐⭐ THE BACKED-OFF HATCH IS 45° ON SCREEN, **UNDER THE CABINET SHEAR** — measured, and the finding
 * that sent this here did NOT reproduce.
 *
 * The review filed *"the backed-off RESTRICTED hatch is no longer 45° after the matrix shear"*. It is:
 * the pattern is `patternUnits="userSpaceOnUse"`, so it is painted in the sheared user space, and
 * composing the two transforms by hand gives EXACTLY 45°. The hatch line is vertical `(0,1)`;
 * `patternTransform="rotate(45)"` takes it to `(-1,1)/√2`; the cell matrix `[1 0; 0.4 −0.6]` takes
 * `(-1,1)` to `(-0.6,-0.6)`. Equal components ⇒ a 45° line.
 *
 * ⛔ IT IS A COINCIDENCE OF THE SHIPPED DEPTH RATIO, NOT A LAW — it holds because
 * `DEPTH_RATIO.x − 1 === DEPTH_RATIO.y` (0.4 − 1 = −0.6) — so it is worth exactly one test. Move
 * either constant in `render/oblique.js` and the room's back-off hatch goes off 45° silently, with
 * every other assertion in this file green.
 *
 * The RESTRICTED wedge's hypotenuse rides the same direction and is asserted alongside it.
 *
 * MUTATION: `patternTransform="rotate(45)"` → `rotate(0)` ⇒ RED (the composed angle becomes ~59°).
 * MUTATION: `DEPTH_RATIO.x` 0.4 → 0.5 in oblique.js ⇒ RED (the composed angle becomes ~40°).
 */
test('VR-P3: the back-off hatch composes to 45° THROUGH the cabinet shear (measured, not assumed)', () => {
  const focus = { deck: 0, rx: 0, ry: 0, rw: 4, rh: 3 };
  const scene = roomScene(focus);
  const unit = scene.s * 100;
  const place = scenePlacement(scene, focus, unit);
  const svg = zoneLayerSvg(roomZoneTiles([{ x: 1, y: 1, deck: 0, mask: 1 << 3, flags: ZONE_FLAG_BACKED_OFF }], focus),
    focus, place, unit);

  // THE TWO TRANSFORMS, both read out of the SHIPPED markup rather than restated.
  const rot = Number(/patternTransform="rotate\(([-\d.]+)\)"/.exec(svg)[1]);
  const m = /<g class="rz-zone[^"]*" transform="matrix\(([^)]*)\)"/.exec(svg);
  assert.ok(m, 'the cell carries no matrix — the layer is not in the floor plane at all');
  const [a, b, c, d] = m[1].split(' ').map(Number);
  const line = /<line x1="0" y1="0" x2="0" y2="([\d.]+)"/.exec(svg);
  assert.ok(line, 'the hatch pattern draws no line — there is no angle to measure');

  const th = (rot * Math.PI) / 180;
  // the hatch line's own direction (0,1), turned by patternTransform, then by the cell matrix
  const [lx, ly] = [-Math.sin(th), Math.cos(th)];
  const [sx, sy] = [a * lx + c * ly, b * lx + d * ly];
  const deg = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 180;
  assert.ok(Math.abs(deg - 45) < 0.05,
    `the back-off hatch draws at ${deg.toFixed(2)}° on screen, not 45°. It is painted in the user `
    + 'space the cell matrix has sheared, so the `rotate(45)` in the def is not the angle the player '
    + 'sees — and a hatch that is not 45° reads as a different mark from the wall hatch beside it.');

  // …and the RESTRICTED wedge's hypotenuse rides the same direction (its `h9k v9k z` close).
  const [wx, wy] = [a * -1 + c * 1, b * -1 + d * 1];
  const wdeg = ((Math.atan2(wy, wx) * 180) / Math.PI + 360) % 180;
  assert.ok(Math.abs(wdeg - 45) < 0.05,
    `the RESTRICTED corner wedge's hypotenuse draws at ${wdeg.toFixed(2)}° — the cut corner is the `
    + 'SHAPE that carries the state under E3, and a sheared one is a different shape');

  // NON-VACUITY: the composition really is doing work — an UNROTATED pattern would NOT land on 45°.
  const [ux, uy] = [a * 0 + c * 1, b * 0 + d * 1];
  const udeg = ((Math.atan2(uy, ux) * 180) / Math.PI + 360) % 180;
  assert.ok(Math.abs(udeg - 45) > 5,
    'a hatch with no patternTransform at all would already read 45° through this matrix, so the '
    + 'assertion above is not measuring the composition');
});
