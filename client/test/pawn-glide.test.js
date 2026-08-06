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
// ⛔ WHICH TILE DECIDES WHAT — the question this file got WRONG the first time, and the send-back
// that corrected it. The original header read "room membership, selection and click targets keep the
// INTEGER tile", and section 3 asserted it. That pinned a DEFECT: because the sim tile leads the
// drawn body by up to a full tile, a room filtered on the sim tile but drawn at the fraction puts a
// figure where there is no floor — measured live at 4.4% of frames, one of them a crew member
// standing on the cryo bay's back wall. The rule is now split by PURPOSE, not by habit:
//   · ANYTHING DRAWN, and anything that must agree with what is drawn — the two pawn layers, the
//     Room Zoom's membership (`roomCrew`), its `N HERE` caption, the dock's HERE flag, the pawn hit
//     test — uses the DRAWN tile. Section 3 pins both boundary directions.
//   · ANYTHING ADDRESSED TO THE SIM — `crewClickTarget`, which produces the `Cmd.click` the host
//     resolves through `Citizen.Pos` — keeps the INTEGER tile, and section 3 pins that too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { overviewScene, makeTransform, pawnLayerParts } from '../src/ui/overview-scene.js';
import { pawnParts } from '../src/ui/roomzoom-view.js';
import { makePawnLayer } from '../src/ui/pawn-layer.js';
import { roomScene, scenePlacement, roomCrew, crewHitAtTile, drawnTile } from '../src/ui/room-model.js';
import { crewClickTarget } from '../src/ui/console-model.js';

const FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);
const view = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))),
  decodeRooms(decode(JSON.stringify(FIX.rooms))));

const BASE = FIX.roster.crew[0];             // deck 0, tile (8,8), task "Idle"
const withPos = (over) => [{ ...BASE, ...over }];
const state = (crew) => ({ deck: 0, decksView: view, frame: FIX.frame, crew, designs: [], marks: [] });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ WHERE THE FIGURE IS DRAWN MOVED FROM THE ART TO THE GROUP (2026-08-05, the client-side tween),
// AND EVERY CLAIM IN THIS FILE IS UNCHANGED BY THAT.
//
// Both surfaces rebuild their scene as one `innerHTML` string ~10×/s, so a figure inside the scene
// cannot be interpolated between two roster samples — no node lives long enough. The figures now live
// in a persistent overlay `<svg>` per surface: the ART is built FOOT-RELATIVE (drawn around (0,0)) by
// the pure `pawnLayerParts` / `pawnParts`, and the person's SCREEN POSITION is a `translate` on their
// own `<g>`, which `pawn-layer.js` writes.
//
// So `bodyAt` reads the GROUP's translate rather than the sprite's. The two questions this file asks
// — "is the figure drawn at the projected place of `fx`/`fy`?" and "does everything hanging off her
// move WITH her?" — are answered more directly than before: the second one is now structural, because
// the plate, the tag and the underline are INSIDE the group that moves.
//
// ⛔ THE HELPERS MOUNT THROUGH THE REAL LAYER rather than pasting `'<g …>' + part.html`. A hand-built
// wrapper here would be a second copy of the mount contract, and a change to `makePawnLayer` (a
// different attribute, a different transform spelling) would leave this file green while the game
// drew every crew member at the layer origin.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The smallest element the layer can mount into: attributes, innerHTML, ordered children. */
function recEl() {
  const e = {
    attributes: {}, dataset: {}, innerHTML: '', children: [], ownerDocument: null,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
  };
  e.ownerDocument = { createElementNS: () => recEl() };
  return e;
}

/** Mount `parts` through the shipped layer, placed at the newest sample (settled), and serialize. */
function mountParts(parts, groupClass) {
  const host = recEl();
  const layer = makePawnLayer(host, { groupClass });
  layer.sync(parts);
  layer.place(new Map(parts.map((p) => [String(p.cid), { x: p.x, y: p.y }])));
  return host.children.map((g) => '<g class="' + g.attributes.class + '" data-cid="'
    + g.attributes['data-cid'] + '" transform="' + (g.attributes.transform || '') + '">'
    + g.innerHTML + '</g>').join('');
}

/** The OVERVIEW's mounted pawn markup for a scene state. */
function ovPawns(st) {
  const deck = st.deck | 0;
  const entry = (st.decksView || []).find((d) => d.deck === deck);
  const t = makeTransform(entry ? entry.slots : [], st.frame);
  return mountParts(pawnLayerParts(st.crew, deck, t, st.selectedCid, 'ov'), 'pl-pawn');
}

/** The pawn GROUP's emitted `translate(x y)` for one cid — where the person is drawn. */
function bodyAt(svg, cid, cls) {
  const chunk = svg.split(`<g class="${cls}" data-cid="${cid}"`)[1];
  assert.ok(chunk, `no ${cls} for cid ${cid} in the rendered svg`);
  const m = /^[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"/.exec(chunk);
  assert.ok(m, `no pawn transform in ${cls}`);
  return { x: +m[1], y: +m[2] };
}

/** The pawn's label-pill rect for one cid (Overview). */
function pillAt(svg, cid) {
  const chunk = svg.split(`<g class="pl-pawn" data-cid="${cid}"`)[1];
  assert.ok(chunk, 'no pawn chunk');
  const m = /<g class="pl-tag[^"]*">[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)"/.exec(chunk);
  assert.ok(m, 'no label pill');
  // ⭐ ON-SCREEN, not local. The pill is emitted foot-relative now, so the local rect is IDENTICAL
  // for every pawn on the plate — a test reading it raw would assert nothing at all. The sum with
  // the group's translate is the same screen box the old absolute emission produced.
  const at = bodyAt(svg, cid, 'pl-pawn');
  return { x: +m[1] + at.x, y: +m[2] + at.y };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE OVERVIEW PLATE (`pawnLayer`)
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('overview: fx/fy draw the pawn BETWEEN two tiles', () => {
  const at8 = bodyAt(ovPawns(state(withPos({ x: 8, y: 8 }))), BASE.cid, 'pl-pawn');
  const at9 = bodyAt(ovPawns(state(withPos({ x: 9, y: 8 }))), BASE.cid, 'pl-pawn');
  assert.notDeepEqual(at8, at9, 'precondition: the two tiles render at different places');

  // Mid-glide: the sim tile is still 8, the wire says 8.5.
  const mid = bodyAt(ovPawns(state(withPos({ x: 8, y: 8, fx: 8.5, fy: 8 }))), BASE.cid, 'pl-pawn');
  assert.notDeepEqual(mid, at8, 'the figure left the tile it is standing on');
  assert.notDeepEqual(mid, at9, 'the figure has not arrived either');
  // The projection is affine in tile space, so half way on the wire is half way on screen.
  assert.ok(Math.abs(mid.x - (at8.x + at9.x) / 2) < 0.15, `x halfway: ${mid.x} vs ${(at8.x + at9.x) / 2}`);
  assert.ok(Math.abs(mid.y - (at8.y + at9.y) / 2) < 0.15, `y halfway: ${mid.y} vs ${(at8.y + at9.y) / 2}`);
});

test('overview: ten sub-tile positions are ten DISTINCT drawn places', () => {
  const seen = new Set();
  for (let k = 0; k < 10; k += 1) {
    const svg = ovPawns(state(withPos({ x: 8, y: 8, fx: 8 + k / 10, fy: 8 })));
    seen.add(JSON.stringify(bodyAt(svg, BASE.cid, 'pl-pawn')));
  }
  assert.equal(seen.size, 10, 'one drawn position per tick of the crossing (was 1: the teleport)');
});

test('overview: no fx/fy ⇒ byte-identical to the integer tile (old-host compat)', () => {
  const withoutGlide = ovPawns(state(withPos({ x: 8, y: 8 })));
  const explicitTile = ovPawns(state(withPos({ x: 8, y: 8, fx: 8, fy: 8 })));
  assert.equal(withoutGlide, explicitTile, 'a standing crew member (fx === x) renders as the fallback does');

  // …and the fallback survives the shapes a half-built host can actually send.
  for (const junk of [null, undefined, NaN, 'nope']) {
    const svg = ovPawns(state(withPos({ x: 8, y: 8, fx: junk, fy: junk })));
    assert.equal(svg, withoutGlide, `fx=${String(junk)} must fall back to the integer tile, not to 0`);
  }
});

test('overview: the label pill follows the drawn feet, not the sim tile', () => {
  const standing = pillAt(ovPawns(state(withPos({ x: 8, y: 8 }))), BASE.cid);
  const gliding = pillAt(ovPawns(state(withPos({ x: 8, y: 8, fx: 8.6, fy: 8 }))), BASE.cid);
  assert.notEqual(standing.x, gliding.x, 'the pill slid with the figure — a pinned pill detaches');
  const body = bodyAt(ovPawns(state(withPos({ x: 8, y: 8, fx: 8.6, fy: 8 }))), BASE.cid, 'pl-pawn');
  const bodyStand = bodyAt(ovPawns(state(withPos({ x: 8, y: 8 }))), BASE.cid, 'pl-pawn');
  assert.ok(Math.abs((gliding.x - standing.x) - (body.x - bodyStand.x)) < 0.15,
    'the pill moved by exactly what the body moved by');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE ROOM ZOOM (`pawnSvg`) — and the placement it stands on
// ═════════════════════════════════════════════════════════════════════════════════════════════

const FOCUS = { rx: 2, ry: 3 };
const RZ = (crew) => mountParts(pawnParts(crew, FOCUS), 'rz-pawn-root');

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
  const at4 = bodyAt(RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, task: 'Idle' }]), 1, 'rz-pawn-root');
  const at5 = bodyAt(RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 5, y: 5, task: 'Idle' }]), 1, 'rz-pawn-root');
  assert.notDeepEqual(at4, at5);

  const mid = bodyAt(RZ([{ cid: 1, name: 'Vega', role: 'crew', x: 4, y: 5, fx: 4.5, fy: 5, task: 'Idle' }]), 1, 'rz-pawn-root');
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
  // ON-SCREEN x, i.e. the group's translate plus the local rect — see `pillAt`'s note: the plate and
  // the tag are drawn foot-relative now, so their LOCAL x is the same for a figure anywhere in the
  // room and a raw read would make both assertions below unfalsifiable.
  const plateX = (svg) => +/<g class="rz-nametag[^"]*">[\s\S]*?<rect x="([-\d.]+)"/.exec(svg)[1]
    + bodyAt(svg, 1, 'rz-pawn-root').x;
  const tagX = (svg) => +/<g class="rz-worktag">[\s\S]*?<rect x="([-\d.]+)"/.exec(svg)[1]
    + bodyAt(svg, 1, 'rz-pawn-root').x;
  const still = one();
  const glide = one({ fx: 4.9, fy: 5 });
  assert.notEqual(plateX(still), plateX(glide), 'the name plate followed the feet');
  assert.notEqual(tagX(still), tagX(glide), 'the work tag followed the head');
  const dBody = bodyAt(glide, 1, 'rz-pawn-root').x - bodyAt(still, 1, 'rz-pawn-root').x;
  assert.ok(Math.abs((plateX(glide) - plateX(still)) - dBody) < 1e-6, 'plate moved exactly with the body');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. ⭐⭐ THE ROOM BOUNDARY — the send-back, and the leg that used to pin the BROKEN case.
//
// This section previously asserted "room membership is decided by the SIM tile, never by the glide",
// and it was WRONG: it pinned the defect. The sim tile leads the drawn body by up to a full tile, so
// a room filtered on the sim tile and drawn at the fraction disagrees at every boundary. Review
// measured 14 of 319 live frames (4.4%) drawing outside the focused room, with a screenshot of a
// crew member standing ON THE CRYO BAY'S BACK WALL at wire `5,7|5,7.8`.
//
// The rule is now ONE tile for both: `roomCrew` admits a crew member on her DRAWN tile, which is by
// construction the tile whose floor quad holds her feet. Both directions are covered here, and the
// geometry is asserted against the PROJECTED floor quad rather than against the rule that produced
// it — a test that only re-stated `Math.round` could not have caught the original defect either.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const ROOM = { deck: 0, rx: 4, ry: 5, rw: 3, rh: 3 };   // tiles x ∈ [4,6], y ∈ [5,7]
const soul = (over) => ({ cid: 1, name: 'Vega', role: 'crew', deck: 0, task: 'Idle', ...over });

/** Is point p inside the parallelogram [a,b,c,d] (wound consistently)? Cross-product sign test. */
function insideQuad(p, quad) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i], b = quad[(i + 1) % 4];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-9) continue;            // on the edge — still inside
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/**
 * The focused room's WHOLE floor, as a projected quad — each corner taken from the tile that owns
 * it. (Reading `nearRight` off the FAR row instead builds a quad one tile short on one side, which
 * is a fine way to make this test fail for a reason that has nothing to do with the pawn.)
 */
function roomFloorQuad(focus) {
  const place = scenePlacement(roomScene(focus), focus);
  const x0 = focus.rx, y0 = focus.ry;
  const x1 = focus.rx + focus.rw - 1, y1 = focus.ry + focus.rh - 1;
  return [
    place.corners(x0, y0).nearLeft,
    place.corners(x1, y0).nearRight,
    place.corners(x1, y1).farRight,
    place.corners(x0, y1).farLeft,
  ];
}

test('LEAVING: she stays drawn until her BODY crosses — no vanish, and the click still lands', () => {
  // Sim tile already outside (7); body still a full tile inside (6.1). The reviewer's exit receipt.
  const leaving = soul({ x: 7, y: 5, fx: 6.1, fy: 5 });
  assert.equal(roomCrew([leaving], ROOM).length, 1,
    'she VANISHED from the cutaway while her body was still inside it — the exit half of the defect');
  assert.equal(crewHitAtTile([leaving], ROOM, 6, 5).cid, 1,
    'a figure you can see must be a figure you can click');

  // …and she leaves the list exactly when the body crosses the threshold, not a tile early.
  assert.equal(roomCrew([soul({ x: 7, y: 5, fx: 6.4, fy: 5 })], ROOM).length, 1, 'still on the floor at 6.4');
  assert.equal(roomCrew([soul({ x: 7, y: 5, fx: 6.6, fy: 5 })], ROOM).length, 0, 'past the edge at 6.6');
});

test('ENTERING: she is never drawn where there is no floor', () => {
  // Sim tile already inside (4); body still outside (3.1). The reviewer's entry receipt — this is
  // the frame that drew a crew member standing on the back wall.
  assert.equal(roomCrew([soul({ x: 4, y: 5, fx: 3.1, fy: 5 })], ROOM).length, 0,
    'drawn 0.9 tile outside the room quad — there is no floor there, only the back wall');
  assert.equal(roomCrew([soul({ x: 4, y: 5, fx: 3.4, fy: 5 })], ROOM).length, 0, 'still outside at 3.4');
  assert.equal(roomCrew([soul({ x: 4, y: 5, fx: 3.6, fy: 5 })], ROOM).length, 1,
    'she appears as the body crosses the threshold, standing on the room edge');
});

test('EVERY drawn member has her feet inside the room floor — swept across both boundaries', () => {
  const quad = roomFloorQuad(ROOM);
  const place = scenePlacement(roomScene(ROOM), ROOM);
  let drawn = 0, skipped = 0;
  // Sweep a full walk THROUGH the room in tenths, on BOTH axes — starting a tile and a half outside
  // one side and ending a tile and a half outside the other, so both boundaries are crossed.
  const sweep = [];
  for (let k = -15; k <= (ROOM.rw - 1) * 10 + 15; k += 1) sweep.push(ROOM.rx + k / 10);   // x axis
  for (const f of sweep) {
    // one walker crossing on X (fy pinned to a middle row), one crossing on Y (fx pinned)
    const fyRow = ROOM.ry + 1, fxCol = ROOM.rx + 1;
    const fOnY = ROOM.ry + (f - ROOM.rx);
    for (const [fx, fy] of [[f, fyRow], [fxCol, fOnY]]) {
      const c = soul({ x: Math.round(fx), y: Math.round(fy), fx, fy });
      if (roomCrew([c], ROOM).length === 0) { skipped += 1; continue; }
      drawn += 1;
      const foot = place.foot(fx, fy);
      assert.ok(insideQuad(foot, quad),
        `a DRAWN member's feet landed outside the room floor at fx=${fx} fy=${fy} → ${foot}`);
    }
  }
  // Non-vacuity both ways: a sweep that drew nobody, or excluded nobody, proves nothing.
  assert.ok(drawn > 40, `too few drawn positions swept (${drawn})`);
  assert.ok(skipped > 20, `the sweep never left the room (${skipped}) — it cannot see an overhang`);
});

test('what must NOT follow the glide: the host is still addressed by the SIM tile', () => {
  // `crewClickTarget` produces the {x,y} of a `Cmd.click`, and the HOST resolves that click through
  // `Citizen.Pos`. If it ever followed the drawn position, selecting a walking crew member would
  // send the server a tile she is not on and select nobody. It reads `frame.crew`, never fx/fy.
  const frame = { deck: 0, crew: [[7, 5, 0, 1]] };
  assert.deepEqual(crewClickTarget(frame, soul({ x: 7, y: 5, fx: 6.1, fy: 5 })), { x: 7, y: 5 });
  // And with no frame tuple it falls back to the roster's INTEGER x/y, not to the glide.
  assert.deepEqual(crewClickTarget(null, soul({ x: 7, y: 5, fx: 6.1, fy: 5 })), { x: 7, y: 5 });
});

// ⭐ THE SAME QUESTION, ASKED OF THE OVERVIEW PLATE — and the answer is that it has no such hazard.
// The plate filters on `c.deck`, not on a rect, and the deck axis CANNOT go fractional: a deck
// change is a ladder step, `PathService.GetNeighbors` emits it at the same X/Y, and
// `GameSession.WalkFraction` refuses to interpolate across Z anyway. So there is no frame in which
// a pawn is drawn on two decks, or between them. Pinned here because the send-back asked the
// question, and because "we checked and it was fine" is not evidence.
test('overview: a gliding pawn is drawn on exactly ONE deck, never between two', () => {
  const gliding = withPos({ deck: 0, x: 8, y: 8, fx: 8.5, fy: 8 });
  const onDeck0 = ovPawns({ ...state(gliding), deck: 0 });
  const onDeck1 = ovPawns({ ...state(gliding), deck: 1 });
  assert.equal((onDeck0.match(/class="pl-pawn"/g) || []).length, 1, 'her own deck must draw her');
  assert.equal((onDeck1.match(/class="pl-pawn"/g) || []).length, 0, 'another deck must not');
  // The wire cannot express "half way between decks": there is no fz, and the deck is an integer.
  assert.equal(Object.keys(gliding[0]).includes('fz'), false, 'no fractional deck exists on the wire');
});

test('a crew member with NO glide is filtered exactly as before the package', () => {
  assert.equal(roomCrew([soul({ x: 6, y: 5 })], ROOM).length, 1);
  assert.equal(roomCrew([soul({ x: 7, y: 5 })], ROOM).length, 0);
  assert.equal(roomCrew([soul({ x: 6, y: 5, fx: null, fy: 'x' })], ROOM).length, 1, 'junk ⇒ the sim tile');
  assert.equal(roomCrew([soul({ x: 6, y: 5, deck: 1, fx: 6, fy: 5 })], ROOM).length, 0, 'wrong deck');
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

  // ⭐ AND THE SIM TILE DOES **NOT** ANSWER — the "fallback" the first draft carried is deleted.
  // Nothing is drawn on tile 7 (she is drawn on 6), so a click there is a click on bare floor, and
  // selecting an invisible pawn from bare floor is the mirror of the bug this whole item is about.
  assert.equal(crewHitAtTile([walker], focus, 7, 5), null,
    'clicking where NOTHING IS DRAWN selected someone');
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
