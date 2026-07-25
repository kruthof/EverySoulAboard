// THE STOCKPILE-ZONE OVERLAY — the client half of the `zones` channel (console-retirement WP-3).
//
// What is being guarded, in order of how badly it bites:
//   1. THE FLAG CONSTANT crosses a language boundary with no compiler between the two sides. If
//      `WireFormat.ZoneFlagBackedOff` and `ZONE_FLAG_BACKED_OFF` ever disagree, the overlay reads the
//      wrong bit and the surface silently stops saying "no hauler reached this recently" — the exact
//      silence this whole package exists to end. So the C# constant is parsed out of its own source
//      and compared, the tripwire palette.test.js runs against GlyphColor.cs and
//      stock-filter-model.test.js against ItemStack.cs.
//   2. THE ACCEPT-ALL SENTINEL. The host ships accept-all (127) for a tile with NO filter entry.
//      Read "restricted" as `mask !== 0` instead of `mask !== ACCEPT_ALL` and every zone on the ship
//      wears a restriction badge nobody set; read it as `mask === 0` and nothing ever does.
//   3. THE 32-BIT COERCION. `| 0` on the mask would zero every bit at index 32+, i.e. would silently
//      turn a wide filter into "accepts nothing". Not reachable at 7 ItemKinds; the assertion is what
//      makes it stay unreachable.
//   4. THE ORDER. The host emits canonical z,y,x and that IS the wire contract; a client-side sort
//      would be a second, divergent authority on order.
//   5. THAT THE ROOM ZOOM ACTUALLY DRAWS IT. A wire channel with a decoder and no renderer is the
//      failure this programme's boundary tests exist to catch — from the other direction.
//
// EVERY SOURCE SCAN HERE READS CODE, NOT PROSE. `codeOnly` is the live implementation ported from
// surface-boundary.test.js (CLAUDE.md's "traps" §1: a guard matching raw source text is satisfied by
// the thing it guards against, COMMENTED OUT — that shipped four times in one day). Its behaviour is
// asserted in both directions at the bottom of this file: comments must not trip the scans, and real
// code must.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decodeZones, ZONE_FLAG_BACKED_OFF } from '../src/wire/messages.js';
import { ACCEPT_ALL } from '../src/ui/stock-filter-model.js';
import {
  ACCEPTS_ALL_LABEL, BACKED_OFF_LABEL, roomZoneTiles, zoneBackedOff, zoneLabel, zoneLegendRows,
  zoneRestricted,
} from '../src/ui/zone-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

/**
 * Strip JS/C# comments, STRING-LITERAL AWARE — verbatim port of `codeOnly` in
 * surface-boundary.test.js (which is itself mirrored by `CodeOnly` in SurfaceBoundaryTests.cs). A
 * '…'/"…" scan terminates at the newline, so an unbalanced quote can damage at most its own line and
 * can never blind a scan to end of file. Not re-derived: CLAUDE.md names the live implementations to
 * copy precisely because the hand-rolled ones keep shipping with holes.
 */
function codeOnly(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;          // drop to EOL, keep the \n
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
    } else if (c === '\'' || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        const done = src[i] === q || (q !== '`' && src[i] === '\n');
        i += 1;
        if (done) break;
      }
    } else {
      out += c; i += 1;
    }
  }
  return out;
}

const WIRE_ZONES_CS = codeOnly(read(join(REPO, 'hosts/web/WireFormat.Zones.cs')));
const ROOMZOOM = codeOnly(read(join(CLIENT, 'src/ui/roomzoom-view.js')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));
const OVERLAY = codeOnly(read(join(CLIENT, 'src/ui/zone-overlay.js')));

// ════════════════════════════════════════════════════════════════════ the cross-language constant

// MUTATION: change `ZoneFlagBackedOff = 1` to `= 2` in hosts/web/WireFormat.Zones.cs ⇒ this fails and
// names both files. MUTATION 2: change ZONE_FLAG_BACKED_OFF in messages.js ⇒ same.
test('ZONE_FLAG_BACKED_OFF matches the host constant it mirrors', () => {
  const m = /const\s+int\s+ZoneFlagBackedOff\s*=\s*(\d+)\s*;/.exec(WIRE_ZONES_CS);
  assert.ok(m, 'ZoneFlagBackedOff was not found in hosts/web/WireFormat.Zones.cs — either it was ' +
    'renamed (follow it here in the same commit) or this parse has rotted, in which case every ' +
    'assertion resting on it is vacuous');
  assert.equal(ZONE_FLAG_BACKED_OFF, Number(m[1]),
    `the client reads bit ${ZONE_FLAG_BACKED_OFF} of a zones tuple's flags and the host writes ` +
    `${m[1]}. The two are one contract with no compiler across it: disagree and the overlay reads ` +
    'a bit nobody sets, so a zone no hauler can reach goes back to being silent (MECHANICS §13.17).');
  // Non-vacuity: a flag of 0 would make zoneBackedOff() constantly false and every backed-off
  // assertion below would pass while testing nothing.
  assert.ok(ZONE_FLAG_BACKED_OFF > 0, 'the flag must actually set a bit');
});

// MUTATION: emit the tuple as [x,y,deck,flags,mask] in WireFormat.Zones.cs ⇒ this fails.
test('the host writes the tuple in the order the decoder reads it', () => {
  // The emitter's element order, read off the Append chain rather than trusted from a comment.
  const body = WIRE_ZONES_CS.slice(WIRE_ZONES_CS.indexOf('public static string Zones('));
  const fields = [...body.matchAll(/c\.(X|Y|Deck|AcceptMask|Flags)\.ToString/g)].map((h) => h[1]);
  assert.deepEqual(fields, ['X', 'Y', 'Deck', 'AcceptMask', 'Flags'],
    'the `zones` tuple is [x, y, deck, mask, flags] and decodeZones indexes it positionally; ' +
    `the emitter now writes ${JSON.stringify(fields)}`);
});

// ════════════════════════════════════════════════════════════════════════════════════ decodeZones

test('decodeZones reads the tuple positionally and preserves the host order', () => {
  const rows = decodeZones({ type: 'zones', cells: [[3, 4, 0, 127, 0], [1, 2, 1, 8, 1]] });
  assert.deepEqual(rows, [
    { x: 3, y: 4, deck: 0, mask: 127, flags: 0 },
    { x: 1, y: 2, deck: 1, mask: 8, flags: 1 },
  ]);
  // ORDER IS THE WIRE CONTRACT. The host emits z,y,x; this row pair is deliberately NOT sorted, so a
  // client-side sort sneaking in (a second authority on order) fails here.
  assert.deepEqual(rows.map((r) => r.x), [3, 1]);
});

test('decodeZones is tolerant: garbage in, null or a dropped row, never a throw', () => {
  assert.equal(decodeZones(null), null);
  assert.equal(decodeZones({ type: 'materials', cells: [] }), null, 'wrong channel');
  assert.equal(decodeZones({ type: 'zones' }), null, 'no cells array');
  assert.deepEqual(decodeZones({ type: 'zones', cells: [] }), [], 'the inert empty payload');
  // A short row, a non-array row and junk are dropped; the good row survives.
  assert.deepEqual(decodeZones({ type: 'zones', cells: [[1, 2, 0], 'x', null, [9, 8, 0, 127, 0]] }),
    [{ x: 9, y: 8, deck: 0, mask: 127, flags: 0 }]);
});

// MUTATION: coerce the mask with `t[3] | 0` in messages.js ⇒ this fails. `| 0` is a 32-bit operation,
// so bit 40 becomes 0 — a filter that accepts nothing, silently. Unreachable at 7 ItemKinds; the
// point of the assertion is that it stays unreachable when the enum grows.
test('decodeZones does not truncate a mask to 32 bits', () => {
  const wide = 2 ** 40;
  const rows = decodeZones({ type: 'zones', cells: [[0, 0, 0, wide, 0]] });
  assert.equal(rows[0].mask, wide,
    'the mask was coerced with a 32-bit operator, so every bit at index 32+ was silently zeroed');
});

// ═══════════════════════════════════════════════════════════════════════ restricted / backed off

// MUTATION: `mask !== ACCEPT_ALL` → `mask !== 0` in zone-model.js ⇒ this fails (an unfiltered tile,
// which is the common case, would wear a restriction badge). MUTATION 2: → `mask === 0` ⇒ also fails
// (a real "accepts nothing" zone would read as unrestricted).
test('zoneRestricted is exactly "not accept-all"', () => {
  assert.equal(zoneRestricted(ACCEPT_ALL), false, 'the host ships accept-all for an UNFILTERED tile');
  assert.equal(zoneRestricted(1 << 3), true, 'FOOD only is a restriction');
  assert.equal(zoneRestricted(0), true, 'accept-nothing is the strongest restriction there is');
  // Junk reads PERMISSIVE: an unreadable mask must not paint a restriction the player never set.
  assert.equal(zoneRestricted(undefined), false);
  assert.equal(zoneRestricted(NaN), false);
});

test('zoneBackedOff reads bit 0 of flags and ignores the rest', () => {
  assert.equal(zoneBackedOff(0), false);
  assert.equal(zoneBackedOff(ZONE_FLAG_BACKED_OFF), true);
  // A future flag bit must not be mistaken for this one, in either direction.
  assert.equal(zoneBackedOff(2), false, 'an unrelated flag bit is not a back-off');
  assert.equal(zoneBackedOff(ZONE_FLAG_BACKED_OFF | 2), true);
  assert.equal(zoneBackedOff(undefined), false);
});

// BOTH FACTS, NEITHER SUPPRESSING THE OTHER. The first draft let the back-off wording REPLACE the
// filter list, so on a restricted-AND-backed-off tile — the state a player most needs to tell apart —
// the restriction was unreadable by any means at all (the visual marks were both amber too).
//
// MUTATION: drop the `zoneRestricted` branch so the back-off wording wins alone ⇒ this fails.
// MUTATION 2: put the filter list first ⇒ fails (the urgent fact must lead).
test('zoneLabel names BOTH facts, back-off first', () => {
  assert.equal(zoneLabel(ACCEPT_ALL, 0), ACCEPTS_ALL_LABEL);
  assert.equal(zoneLabel(1 << 3, 0), 'FOOD');
  assert.equal(zoneLabel(ACCEPT_ALL, ZONE_FLAG_BACKED_OFF), BACKED_OFF_LABEL);
  assert.equal(zoneLabel(1 << 3, ZONE_FLAG_BACKED_OFF), BACKED_OFF_LABEL + ' · FOOD',
    'a tile that is both restricted AND unreached must say so — that is the state that needs telling ' +
    'apart, and it is the one the first draft made unreadable');
  // Never empty: a surface showing this can always show something.
  for (const [m, f] of [[ACCEPT_ALL, 0], [0, 0], [ACCEPT_ALL, 1], [0, 1]]) {
    assert.ok(zoneLabel(m, f).length > 0, `zoneLabel(${m},${f}) must never be empty`);
  }
});

// The wording is a claim about the world and the data cannot support the strong version: the sim-side
// back-off map is a rate limiter with three lifts, so a tile can stop being backed off the tick after
// a door opens. MUTATION: reword BACKED_OFF_LABEL to 'UNREACHABLE' ⇒ this fails.
test('the back-off wording does not claim unreachability', () => {
  assert.match(BACKED_OFF_LABEL, /RECENTLY/,
    'the label must be time-qualified — the flag means "no hauler reached this recently", and the ' +
    'sim cannot support "unreachable" (three things lift a back-off, one of them on the next tick)');
  assert.doesNotMatch(BACKED_OFF_LABEL, /UNREACHABLE/, 'over-claims what the flag knows');
});

// ═══════════════════════════════════════════════════════════════════════════════ roomZoneTiles

const FOCUS = { deck: 0, rx: 10, ry: 5, rw: 4, rh: 3 };   // tiles x10..13, y5..7 on deck 0
const row = (x, y, deck, mask, flags) => ({ x, y, deck, mask, flags });

// MUTATION: drop the `z.deck !== focus.deck` guard in zone-model.js ⇒ this fails. MUTATION 2: make
// the rect bound inclusive (`z.x > focus.rx + focus.rw`) ⇒ the x14 row leaks in and this fails.
test('roomZoneTiles clips to the focused room — deck and rect, half-open', () => {
  const zones = [
    row(10, 5, 0, ACCEPT_ALL, 0),   // top-left corner: IN
    row(13, 7, 0, ACCEPT_ALL, 0),   // bottom-right corner: IN
    row(9, 5, 0, ACCEPT_ALL, 0),    // one left of the rect: OUT
    row(14, 5, 0, ACCEPT_ALL, 0),   // one right of the rect (rx+rw): OUT
    row(10, 4, 0, ACCEPT_ALL, 0),   // one above: OUT
    row(10, 8, 0, ACCEPT_ALL, 0),   // one below (ry+rh): OUT
    row(11, 6, 1, ACCEPT_ALL, 0),   // inside the rect but ANOTHER DECK: OUT
  ];
  assert.deepEqual(roomZoneTiles(zones, FOCUS).map((t) => [t.tx, t.ty]), [[10, 5], [13, 7]]);
});

test('roomZoneTiles tolerates a missing focus or a missing channel', () => {
  assert.deepEqual(roomZoneTiles(null, FOCUS), []);
  assert.deepEqual(roomZoneTiles([row(10, 5, 0, ACCEPT_ALL, 0)], null), []);
});

test('roomZoneTiles annotates each tile with both facts and its wording', () => {
  const tiles = roomZoneTiles([
    row(10, 5, 0, ACCEPT_ALL, 0),                            // plain zone
    row(11, 5, 0, 1 << 3, 0),                                // FOOD only
    row(12, 5, 0, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF),         // unfiltered, unreached
    row(13, 5, 0, 1 << 3, ZONE_FLAG_BACKED_OFF),             // both
  ], FOCUS);

  assert.deepEqual(tiles.map((t) => [t.restricted, t.backedOff]),
    [[false, false], [true, false], [false, true], [true, true]]);
  assert.deepEqual(tiles.map((t) => t.label),
    [ACCEPTS_ALL_LABEL, 'FOOD', BACKED_OFF_LABEL, BACKED_OFF_LABEL + ' · FOOD']);
  // The tile coordinates stay in WORLD space — the caller owns the local transform (roomCells rule).
  assert.deepEqual(tiles.map((t) => t.tx), [10, 11, 12, 13]);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO PROPERTIES THE HEADER CLAIMS, WITH FIXTURES THAT CAN ACTUALLY DISTINGUISH THEM.
//
// Both of these survived the first review round, and for the SAME reason the host-side loop-swap
// mutation survived one file over: the fixtures above are ascending in x with constant or ascending y,
// and a set that is already in sorted order is its own sorted order. `out.sort(...)` — the "second
// authority on order" the header forbids — changed nothing, and `z.__touched = true` inside the loop
// broke the PURE claim with nothing watching. Ordinary fixtures cannot see either.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: `out.sort((a, b) => a.tx - b.tx)` (or any sort) at the end of roomZoneTiles ⇒ fails.
test('roomZoneTiles preserves the HOST order, and the fixture can tell', () => {
  // Deliberately NOT sorted: descending x on one row, then a row above it, then one below.
  const zones = [
    row(13, 6, 0, ACCEPT_ALL, 0),
    row(11, 6, 0, ACCEPT_ALL, 0),
    row(12, 5, 0, ACCEPT_ALL, 0),
    row(10, 7, 0, ACCEPT_ALL, 0),
  ];
  const wire = zones.map((z) => [z.x, z.y]);

  // FIXTURE NON-VACUITY, three ways a sort could sneak in. If any of these equalled the wire order
  // the assertion below would pass under the very mutation it exists to catch.
  const byX = [...wire].sort((a, b) => a[0] - b[0]);
  const byY = [...wire].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const byXY = [...wire].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [name, ord] of [['x', byX], ['y,x', byY], ['x,y', byXY]]) {
    assert.notDeepEqual(ord, wire, `the fixture is already in ${name} order — a sort would be invisible`);
  }

  assert.deepEqual(roomZoneTiles(zones, FOCUS).map((t) => [t.tx, t.ty]), wire,
    'the host emits canonical z,y,x and THAT is the wire contract; a client sort is a second, ' +
    'silently divergent authority on order');
});

// MUTATION: `z.__touched = true;` anywhere inside roomZoneTiles' loop ⇒ the frozen input THROWS
// (ES modules are strict mode) and this fails. MUTATION 2: `out.push(z)` — aliasing the input row into
// the output instead of building a fresh object ⇒ the identity assertion fails, and a later consumer
// mutating a "derived" tile would silently corrupt the wire cache.
test('roomZoneTiles is PURE: inputs are neither mutated nor aliased', () => {
  const zones = [
    Object.freeze(row(10, 5, 0, ACCEPT_ALL, 0)),
    Object.freeze(row(11, 6, 0, 1 << 3, ZONE_FLAG_BACKED_OFF)),
  ];
  const before = JSON.parse(JSON.stringify(zones));

  const tiles = roomZoneTiles(zones, FOCUS);   // must not throw on a frozen row

  assert.deepEqual(JSON.parse(JSON.stringify(zones)), before, 'an input row was mutated');
  assert.equal(tiles.length, 2);
  for (let i = 0; i < tiles.length; i++) {
    assert.notEqual(tiles[i], zones[i], 'a derived tile ALIASES its input row');
    assert.ok(!('x' in tiles[i]), 'a derived tile must carry tx/ty, not the wire row\'s x/y');
  }
  // Non-vacuity: prove the freeze would actually bite, so this is not a test of nothing.
  assert.throws(() => { zones[0].__probe = 1; }, TypeError,
    'the fixture rows are not frozen, so the "never mutates" half of this test cannot fail');
});

// ═════════════════════════════════════════════════════════════════════════════ zoneLegendRows

// The KEY is what makes the marks readable at all (the <title> alone could not be reached).
// MUTATION: collapse the per-mask rows to one bare 'RESTRICTED' ⇒ fails. MUTATION 2: drop the
// backedoff row ⇒ fails. MUTATION 3: return [] always ⇒ fails.
test('zoneLegendRows explains only the states present, one row per distinct filter', () => {
  const tiles = roomZoneTiles([
    row(10, 5, 0, ACCEPT_ALL, 0),
    row(11, 5, 0, 1 << 5, 0),                                 // PARTS
    row(12, 5, 0, 1 << 3, 0),                                 // FOOD  (lower mask ⇒ sorts first)
    row(13, 5, 0, 1 << 3, ZONE_FLAG_BACKED_OFF),              // FOOD again + unreached
  ], FOCUS);

  assert.deepEqual(zoneLegendRows(tiles), [
    { kind: 'zone', label: 'STOCKPILE' },
    { kind: 'restricted', label: 'ACCEPTS FOOD' },
    { kind: 'restricted', label: 'ACCEPTS PARTS' },
    { kind: 'backedoff', label: BACKED_OFF_LABEL },
  ]);
});

test('zoneLegendRows omits what is not there, and is empty for an unzoned room', () => {
  assert.deepEqual(zoneLegendRows([]), [], 'no zones ⇒ no key ⇒ the box hides itself');
  assert.deepEqual(zoneLegendRows(null), []);
  // A room with zones but no filters and no back-offs gets exactly the one row.
  assert.deepEqual(zoneLegendRows(roomZoneTiles([row(10, 5, 0, ACCEPT_ALL, 0)], FOCUS)),
    [{ kind: 'zone', label: 'STOCKPILE' }]);
  // …and one that is unreached but unfiltered gets no 'restricted' row.
  assert.deepEqual(
    zoneLegendRows(roomZoneTiles([row(10, 5, 0, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF)], FOCUS)),
    [{ kind: 'zone', label: 'STOCKPILE' }, { kind: 'backedoff', label: BACKED_OFF_LABEL }]);
});

test('zoneLegendRows does not mutate the tiles it reads', () => {
  const tiles = roomZoneTiles([row(10, 5, 0, 1 << 3, ZONE_FLAG_BACKED_OFF)], FOCUS).map(Object.freeze);
  const before = JSON.parse(JSON.stringify(tiles));
  zoneLegendRows(tiles);
  assert.deepEqual(JSON.parse(JSON.stringify(tiles)), before);
  assert.throws(() => { tiles[0].__probe = 1; }, TypeError, 'the fixture tiles are not frozen');
});

// ══════════════════════════════════════════════════════════════════ the channel is actually DRAWN

// A decoder with no renderer is a wire channel the player can never see — the failure
// tests/Perilune.Tests/SurfaceBoundaryTests.cs catches from the host side, checked here from the
// client side. This scan proves the WIRING; `zone-overlay.test.js` proves the markup itself, which is
// the half that was missing: with the builder living inside roomzoom-view.js, making it return '' left
// the whole gate green.
//
// MUTATION: comment out the `body += zoneLayerSvg(...)` line in roomzoom-view.js ⇒ this fails (which
// is the whole reason every scan runs through codeOnly first). MUTATION 2: delete the `case 'zones'`
// from main.js ⇒ this fails, and so does the C# boundary test. MUTATION 3: drop the paintZoneKey()
// call from repaint() ⇒ the key never renders and this fails.
test('the Room Zoom draws the zone layer + key, and main.js dispatches the channel', () => {
  assert.ok(/case\s*'zones'\s*:/.test(MAIN),
    "client/src/main.js's onMessage switch must dispatch the `zones` channel — it is the standard " +
    'client\'s ONLY dispatch point (tests/Perilune.Tests/SurfaceBoundaryTests.cs pins the same fact)');
  assert.ok(/Hud\.renderZones\(/.test(MAIN), 'the dispatch must reach the shared state cache');
  assert.ok(/roomZoneTiles\(/.test(ROOMZOOM) && /Hud\.getZones\(\)/.test(ROOMZOOM),
    'client/src/ui/roomzoom-view.js must read the cached zones and derive its overlay through the ' +
    'pure model — a channel nothing renders is host work the player can never see');
  assert.ok(/body\s*\+=\s*zoneLayerSvg\(/.test(ROOMZOOM),
    'the zone layer must actually be CONCATENATED into the SVG body. A `zoneLayerSvg` that nobody ' +
    'calls satisfies every other assertion in this test and draws nothing.');
  // `paintZoneKey();` WITH THE SEMICOLON — the statement, not the declaration. The first version of
  // this line matched `/paintZoneKey\(\)/`, which the string `function paintZoneKey() {` satisfies all
  // by itself, so deleting the CALL from repaint() left the assertion green: the key stopped rendering
  // and nothing noticed. Measured, not imagined — it was the one survivor of the mutation round.
  assert.match(ROOMZOOM, /\n\s*paintZoneKey\(\);/,
    'repaint() must CALL paintZoneKey() — a defined-but-never-called painter renders nothing, and the ' +
    'key is the only wording a player can actually read (the <title> alone cannot be reached)');
  assert.ok(/zoneKeyHtml\(/.test(ROOMZOOM) && /zoneLegendRows\(/.test(ROOMZOOM),
    'and it must build that key from the pure model rather than re-deriving the wording here');

  // LAYER ORDER — zones ABOVE the material layer. materialLayerSvg paints an OPAQUE item at U * 1.2,
  // LARGER than the tile, for every floor whose material byte is non-zero; drawn after the zones it
  // would completely occlude the tint on any floor the player has built with a chosen material.
  // (Authored floors are material 0 and skipped, which is why the wrong order looked fine.)
  const zoneAt = ROOMZOOM.indexOf('zoneLayerSvg(_zoneTiles');
  const matAt = ROOMZOOM.indexOf('materialLayerSvg(roomMaterialTiles');
  assert.ok(zoneAt >= 0 && matAt >= 0, 'both layer call sites must be present in the composite');
  assert.ok(matAt < zoneAt,
    'the zone marks must be composited AFTER (above) the material layer, or a player-built floor ' +
    'skin hides the zone it sits on');
});

// The `<title>` is the per-tile detail, and it is only reachable if the group receives pointer events.
// It did NOT: the first draft copied `pointer-events="none"` from every sibling layer, so Chrome's
// hit-test landed on the bare <svg> (no title child) and NO tooltip could ever fire — the wording this
// package was built around reached the DOM and stopped. Verified in a real browser, both before and
// after. This is the CI tripwire for the regression.
//
// MUTATION: put `pointer-events="none"` back on the rz-zones group ⇒ this fails.
test('the zone group receives pointer events, or its <title> can never fire', () => {
  const g = /<g class="rz-zones"[^>]*>/.exec(OVERLAY);
  assert.ok(g, 'the zone group open tag was not found — this scan has rotted');
  assert.doesNotMatch(g[0], /pointer-events\s*=\s*"none"/,
    'the rz-zones group carries pointer-events="none", which silently disables the <title> tooltip ' +
    'that is the only per-tile wording. The Room Zoom\'s handlers are bound to the CONTAINER and ' +
    'resolve tiles from clientX/clientY (never e.target), so letting the group receive events and ' +
    'bubble costs nothing — verified by driving a real drag-build in Chrome.');
  assert.match(g[0], /pointer-events\s*=\s*"visiblePainted"/, 'and it must opt in explicitly');
});

// ═══════════════════════════════════════════════════════════════════════════ NEGATIVE CONTROLS

// Without these, every scan above is satisfied by the thing it guards against sitting in a comment —
// which landed in four separate packages on 2026-07-25 (CLAUDE.md, "Traps", §1).
test('NEGATIVE CONTROL: the scans read code, not comments', () => {
  const prose = [
    "// body += zoneLayerSvg(roomZoneTiles(decodeZones(Hud.getZones()), _focus));  <- the old draft",
    "/* case 'zones': Hud.renderZones(m); break; */",
    'const real = 1;',
  ].join('\n');
  const stripped = codeOnly(prose);
  assert.ok(!/zoneLayerSvg\(/.test(stripped), 'a commented-out draw call satisfied the render scan');
  assert.ok(!/case\s*'zones'\s*:/.test(stripped), 'a commented-out case satisfied the dispatch scan');
  assert.ok(stripped.includes('const real = 1;'), 'the stripper ate live code');
  // …and the C# constant parse is comment-blind too: a documented old value must not win.
  assert.equal(/const\s+int\s+ZoneFlagBackedOff\s*=\s*(\d+)\s*;/.exec(
    codeOnly('// public const int ZoneFlagBackedOff = 99;\npublic const int ZoneFlagBackedOff = 1;'),
  )[1], '1', 'the flag parse read a commented-out value');
});

test('POSITIVE CONTROL: the same text in real code DOES trip the scans', () => {
  const live = "body += zoneLayerSvg(x);\ncase 'zones': Hud.renderZones(m); break;";
  const stripped = codeOnly(live);
  assert.ok(/zoneLayerSvg\(/.test(stripped) && /case\s*'zones'\s*:/.test(stripped),
    'the scans missed real code — every assertion resting on them is then vacuous');
});

test('codeOnly is string-literal aware, so a quoted marker cannot blind the scans', () => {
  const src = 'const url = "http://x//y";\nbody += zoneLayerSvg(t);';
  assert.ok(codeOnly(src).includes('zoneLayerSvg(t)'), 'a quoted "//" swallowed the rest of the source');
  const rx = "const r = /['\"]/g;\nbody += zoneLayerSvg(t);";
  assert.ok(codeOnly(rx).includes('zoneLayerSvg(t)'),
    'an unbalanced quote in a regex ran past its own line — the string scan must stop at the newline');
});

// The scans above are only as good as the files they read. A rename/move makes `read` throw rather
// than pass vacuously, but an EMPTY file would not, so pin that all three really have content.
test('the scanned sources are non-empty', () => {
  for (const [name, text] of [['WireFormat.Zones.cs', WIRE_ZONES_CS], ['roomzoom-view.js', ROOMZOOM],
    ['main.js', MAIN], ['zone-overlay.js', OVERLAY]]) {
    assert.ok(text.length > 500, `${name} parsed to ${text.length} chars — the scan is broken`);
  }
});
