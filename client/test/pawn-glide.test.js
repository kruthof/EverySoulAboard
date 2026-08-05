// ⭐ SMOOTH PAWN MOVEMENT (option B) — THE CLIENT HALF.
//
// The sim stays discrete and the host publishes `fx`/`fy` on the roster: where a walking crew member
// should be DRAWN, as a continuous tile coordinate in the SAME space as the integer `x`/`y` (no
// half-tile centre offset — the convention is written down once, at `WireFormat.RosterEntry.Fx`,
// and this file is the client side of that contract).
//
// TWO CLAIMS, ON BOTH SURFACES:
//   (a) fx/fy PRESENT ⇒ the figure is drawn between the two tiles, at exactly the place the integer
//       tile of that fractional value would be — i.e. the client applies its own centre offset and
//       nothing else. Asserted against the EMITTED transform, not against module state.
//   (b) fx/fy ABSENT ⇒ byte-identical to the integer position (old-host compat). This leg is what
//       stops a `Number.isFinite` guard from quietly becoming `c.fx || c.x` and drawing a walking
//       pawn at tile 0 whenever the host is one version behind.
//
// AND THE LABEL FOLLOWS THE FEET. A name pill pinned to the integer tile while the figure slides out
// from under it is worse than no glide at all, so the pill's emitted rect is checked to move WITH the
// drawn body — the whole point of deriving it from the same `fx`.
//
// ⛔ WHAT MUST NOT MOVE: room membership, selection and click targets keep the INTEGER tile. The
// roomzoom leg drives `roomCrew` (the room filter) with a crew member whose glide has carried her
// fractional position outside the room, and requires her to still be listed as inside it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { overviewScene } from '../src/ui/overview-scene.js';
import { pawnSvg } from '../src/ui/roomzoom-view.js';
import { roomScene, scenePlacement, roomCrew, crewHitAtTile, drawnTile } from '../src/ui/room-model.js';

const FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);
const view = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))),
  decodeRooms(decode(JSON.stringify(FIX.rooms))));

const BASE = FIX.roster.crew[0];             // deck 0, tile (8,8), task "Idle"
const withPos = (over) => [{ ...BASE, ...over }];
const state = (crew) => ({ deck: 0, decksView: view, frame: FIX.frame, crew, designs: [], marks: [] });

/** The pawn body's emitted `translate(x y)` for one cid, read out of the rendered SVG. */
function bodyAt(svg, cid, cls) {
  const chunk = svg.split(`<g class="${cls}" data-cid="${cid}"`)[1]
    ?? svg.split(`<g class="${cls}"`)[1];   // roomzoom's rz-pawn carries no data-cid
  assert.ok(chunk, `no ${cls} for cid ${cid} in the rendered svg`);
  const m = /transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(/.exec(chunk);
  assert.ok(m, `no pawn transform in ${cls}`);
  return { x: +m[1], y: +m[2] };
}

/** The pawn's label-pill rect for one cid (Overview). */
function pillAt(svg, cid) {
  const chunk = svg.split(`<g class="pl-pawn" data-cid="${cid}">`)[1];
  assert.ok(chunk, 'no pawn chunk');
  const m = /<g class="pl-tag[^"]*">[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)"/.exec(chunk);
  assert.ok(m, 'no label pill');
  return { x: +m[1], y: +m[2] };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE OVERVIEW PLATE (`pawnLayer`)
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('overview: fx/fy draw the pawn BETWEEN two tiles', () => {
  const at8 = bodyAt(overviewScene(state(withPos({ x: 8, y: 8 }))), BASE.cid, 'pl-pawn');
  const at9 = bodyAt(overviewScene(state(withPos({ x: 9, y: 8 }))), BASE.cid, 'pl-pawn');
  assert.notDeepEqual(at8, at9, 'precondition: the two tiles render at different places');

  // Mid-glide: the sim tile is still 8, the wire says 8.5.
  const mid = bodyAt(overviewScene(state(withPos({ x: 8, y: 8, fx: 8.5, fy: 8 }))), BASE.cid, 'pl-pawn');
  assert.notDeepEqual(mid, at8, 'the figure left the tile it is standing on');
  assert.notDeepEqual(mid, at9, 'the figure has not arrived either');
  // The projection is affine in tile space, so half way on the wire is half way on screen.
  assert.ok(Math.abs(mid.x - (at8.x + at9.x) / 2) < 0.15, `x halfway: ${mid.x} vs ${(at8.x + at9.x) / 2}`);
  assert.ok(Math.abs(mid.y - (at8.y + at9.y) / 2) < 0.15, `y halfway: ${mid.y} vs ${(at8.y + at9.y) / 2}`);
});

test('overview: ten sub-tile positions are ten DISTINCT drawn places', () => {
  const seen = new Set();
  for (let k = 0; k < 10; k += 1) {
    const svg = overviewScene(state(withPos({ x: 8, y: 8, fx: 8 + k / 10, fy: 8 })));
    seen.add(JSON.stringify(bodyAt(svg, BASE.cid, 'pl-pawn')));
  }
  assert.equal(seen.size, 10, 'one drawn position per tick of the crossing (was 1: the teleport)');
});

test('overview: no fx/fy ⇒ byte-identical to the integer tile (old-host compat)', () => {
  const withoutGlide = overviewScene(state(withPos({ x: 8, y: 8 })));
  const explicitTile = overviewScene(state(withPos({ x: 8, y: 8, fx: 8, fy: 8 })));
  assert.equal(withoutGlide, explicitTile, 'a standing crew member (fx === x) renders as the fallback does');

  // …and the fallback survives the shapes a half-built host can actually send.
  for (const junk of [null, undefined, NaN, 'nope']) {
    const svg = overviewScene(state(withPos({ x: 8, y: 8, fx: junk, fy: junk })));
    assert.equal(svg, withoutGlide, `fx=${String(junk)} must fall back to the integer tile, not to 0`);
  }
});

test('overview: the label pill follows the drawn feet, not the sim tile', () => {
  const standing = pillAt(overviewScene(state(withPos({ x: 8, y: 8 }))), BASE.cid);
  const gliding = pillAt(overviewScene(state(withPos({ x: 8, y: 8, fx: 8.6, fy: 8 }))), BASE.cid);
  assert.notEqual(standing.x, gliding.x, 'the pill slid with the figure — a pinned pill detaches');
  const body = bodyAt(overviewScene(state(withPos({ x: 8, y: 8, fx: 8.6, fy: 8 }))), BASE.cid, 'pl-pawn');
  const bodyStand = bodyAt(overviewScene(state(withPos({ x: 8, y: 8 }))), BASE.cid, 'pl-pawn');
  assert.ok(Math.abs((gliding.x - standing.x) - (body.x - bodyStand.x)) < 0.15,
    'the pill moved by exactly what the body moved by');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE ROOM ZOOM (`pawnSvg`) — and the placement it stands on
// ═════════════════════════════════════════════════════════════════════════════════════════════

const FOCUS = { rx: 2, ry: 3 };
const RZ = (crew) => pawnSvg(crew, FOCUS);

test('roomzoom: scenePlacement.foot is fractional-tolerant and integer-identical', () => {
  const place = scenePlacement(roomScene(FOCUS), FOCUS);
  const a = place.foot(4, 5);
  const b = place.foot(5, 5);
  assert.notDeepEqual(a, b, 'precondition: two tiles, two floor points');
  const mid = place.foot(4.5, 5);
  assert.ok(Math.abs(mid[0] - (a[0] + b[0]) / 2) < 1e-6, 'half a tile lands half way');
  assert.ok(Math.abs(mid[1] - (a[1] + b[1]) / 2) < 1e-6, 'half a tile lands half way');
  // The integer path must not have moved a pixel — every fitting, mark and ghost stands on it.
  assert.deepEqual(place.foot(4, 5), a);
  assert.deepEqual(place.foot(7, 2), scenePlacement(roomScene(FOCUS), FOCUS).foot(7, 2));
});

test('roomzoom: fx/fy stand the figure between two tiles; absent ⇒ the integer tile', () => {
  const at4 = bodyAt(RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, task: 'Idle' }]), 1, 'rz-pawn');
  const at5 = bodyAt(RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 5, y: 5, task: 'Idle' }]), 1, 'rz-pawn');
  assert.notDeepEqual(at4, at5);

  const mid = bodyAt(RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, fx: 4.5, fy: 5, task: 'Idle' }]), 1, 'rz-pawn');
  assert.ok(Math.abs(mid.x - (at4.x + at5.x) / 2) < 0.15, `x halfway: ${mid.x}`);
  assert.ok(Math.abs(mid.y - (at4.y + at5.y) / 2) < 0.15, `y halfway: ${mid.y}`);

  // Old host: no fx/fy at all ⇒ the whole emitted svg matches the integer-tile render.
  const plain = RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, task: 'Idle' }]);
  const pinned = RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, fx: 4, fy: 5, task: 'Idle' }]);
  assert.equal(plain, pinned);
  const junked = RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, fx: null, fy: 'x', task: 'Idle' }]);
  assert.equal(junked, plain, 'a malformed glide falls back to the tile, never to (0,0)');
});

test('roomzoom: the name plate and work tag ride WITH the gliding figure', () => {
  const one = (over) => RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, task: 'Digging out 4,5', ...over }]);
  const plateX = (svg) => +/<g class="rz-nametag[^"]*">[\s\S]*?<rect x="([-\d.]+)"/.exec(svg)[1];
  const tagX = (svg) => +/<g class="rz-worktag">[\s\S]*?<rect x="([-\d.]+)"/.exec(svg)[1];
  const still = one();
  const glide = one({ fx: 4.9, fy: 5 });
  assert.notEqual(plateX(still), plateX(glide), 'the name plate followed the feet');
  assert.notEqual(tagX(still), tagX(glide), 'the work tag followed the head');
  const dBody = bodyAt(glide, 1, 'rz-pawn').x - bodyAt(still, 1, 'rz-pawn').x;
  assert.ok(Math.abs((plateX(glide) - plateX(still)) - dBody) < 1e-6, 'plate moved exactly with the body');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE INTEGER TILE STAYS AUTHORITATIVE
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('room membership is decided by the SIM tile, never by the glide', () => {
  const focus = { deck: 0, rx: 4, ry: 5, rw: 3, rh: 3 };   // tiles x∈[4,6], y∈[5,7]
  const at = (over) => ({ cid: 1, name: 'Vega', role: 'crew', deck: 0, task: 'Idle', ...over });

  // Standing on the room's LAST column, already gliding past its far edge: still IN.
  assert.equal(roomCrew([at({ x: 6, y: 5, fx: 6.9, fy: 5 })], focus).length, 1,
    'a crew member mid-stride still belongs to the tile the sim says she is on');
  // And the mirror: her glide has entered the room but the sim has not. Still OUT.
  assert.equal(roomCrew([at({ x: 7, y: 5, fx: 6.1, fy: 5 })], focus).length, 0,
    'arriving is a SIM fact — the drawn position never admits anyone to a room');
  // Non-vacuity: the same rect does include and exclude on the integer tile.
  assert.equal(roomCrew([at({ x: 6, y: 5 })], focus).length, 1);
  assert.equal(roomCrew([at({ x: 7, y: 5 })], focus).length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE REGRESSION THE GLIDE CREATED — and the tile the player is actually pointing at
//
// The Room Zoom resolves a pawn click through a FLOOR TILE, not a DOM element (the pawn layer is
// `pointer-events="none"`). The sim takes its tile step FIRST, so mid-walk `c.x` is already the
// DESTINATION while the body is drawn on the tile behind — measured live on `--ship wreck`, the
// roster published `tile=(7,2) frac=(8,2)`, a whole tile apart. Clicking the figure would have
// missed her, and clicking the empty tile ahead would have selected her.
//
// (The Overview is NOT affected and is not patched: it hit-tests the drawn `.pl-pawn` element's
// own `data-cid`, so a body that moves takes its hit box with it.)
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('drawnTile is the tile the FEET are in, not a truncation', () => {
  assert.deepEqual(drawnTile({ x: 7, y: 2, fx: 7.4, fy: 2.0 }), { x: 7, y: 2 });
  assert.deepEqual(drawnTile({ x: 7, y: 2, fx: 7.6, fy: 2.0 }), { x: 8, y: 2 });
  assert.deepEqual(drawnTile({ x: 7, y: 2 }), { x: 7, y: 2 }, 'no glide ⇒ the sim tile');
  assert.deepEqual(drawnTile({ x: 7, y: 2, fx: null, fy: 'x' }), { x: 7, y: 2 }, 'junk ⇒ the sim tile');
});

test('roomzoom click hits the pawn WHERE SHE IS DRAWN, mid-glide', () => {
  const focus = { deck: 0, rx: 4, ry: 5, rw: 4, rh: 4 };
  // The live shape: the sim has already stepped her to (7,5); she is still drawn back on (6,5).
  const walker = { cid: 42, name: 'Rell', role: 'crew', deck: 0, x: 7, y: 5, fx: 6.1, fy: 5, task: 'Idle' };

  const onBody = crewHitAtTile([walker], focus, 6, 5);
  assert.ok(onBody, 'clicking the figure selects her — this is the leg that was broken');
  assert.equal(onBody.cid, 42);

  // The sim tile still answers, so nothing that worked before stopped working.
  assert.equal(crewHitAtTile([walker], focus, 7, 5).cid, 42, 'the sim tile remains a fallback');
  assert.equal(crewHitAtTile([walker], focus, 5, 5), null, 'an empty tile still selects nobody');

  // Old host / standing crew: exactly the old behaviour.
  const still = { cid: 43, name: 'Vega', role: 'crew', deck: 0, x: 5, y: 6, task: 'Idle' };
  assert.equal(crewHitAtTile([still], focus, 5, 6).cid, 43);
  assert.equal(crewHitAtTile([still], focus, 6, 6), null);

  // And the DRAWN tile outranks the sim tile when two crew members disagree — the player is
  // pointing at a body, so the body under the cursor wins.
  const other = { cid: 44, name: 'Okafor', role: 'crew', deck: 0, x: 6, y: 5, fx: 5.0, fy: 5, task: 'Idle' };
  assert.equal(crewHitAtTile([other, walker], focus, 6, 5).cid, 42,
    'the figure drawn on the tile wins over the one whose sim tile it is');
});
