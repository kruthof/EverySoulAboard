// Tests for THE SIDE-ELEVATION PROJECTION (client/src/ui/ship-elevation.js) — the plate's one
// coordinate contract. Pure arithmetic; no DOM, no fixture beyond a synthetic ship.
//
// ⛔ WHY THIS FILE EXISTS SEPARATELY FROM `overview-scene.test.js`. VR-P4's send-back had one
// sentence at its centre: *ONE PROJECTION FOR DRAWING AND FOR CLICKS.* The composer's tests can only
// ever see that property through emitted markup; this file sees it in the arithmetic, where a
// violation is a fact about two functions rather than a fact about a string. Both are needed — the
// composer can draw through a correct projection and still emit the wrong thing.
//
// ⚠️ AND THE ROUND TRIP IS NOT SUFFICIENT ON ITS OWN, WHICH IS THIS PACKAGE'S OWN SCAR: the first
// cut of the projection computed everything in the DESIGN's coordinate space while the SVG root
// viewBox is the PLATE's. The tile→point→tile identity read 1620/1620 — a map inverts its own space
// perfectly, whatever space that is — and the decks were drawn 33 px left and 100 px high of the
// hull they belong inside. So this file also pins the SPACE, and the live rig pins the picture.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SRC, VIEW_W, VIEW_H, K, SHIP_XF, BAY, BAY_D, BAND_GAP, MIN_BAND_H, V_SPINE, DECK_M, MINI_H,
  bandLayout, deckPlane, floorPoint, floorSolve, slotSpans, spanBox, makeShipTransform,
} from '../src/ui/ship-elevation.js';
import { DEPTH_RATIO, roomFrame } from '../src/render/oblique.js';

/** A synthetic ship: `decks` decks of `n` compartments, each `w × h` tiles, with a spine between
 *  two banks — the shape every authored ship in this repo really has. */
function ship(decks = 2, n = 8, w = 12, h = 8, gapY = 2) {
  const cols = n / 2;
  return Array.from({ length: decks }, (_, deck) => ({
    deck,
    slots: Array.from({ length: n }, (_, i) => ({
      slotIndex: i,
      anchorName: `d${deck}_s${i}`,
      roomType: i % 3 === 0 ? 5 : 0,
      occupied: true,
      rect: {
        x: (i % cols) * (w - 1), y: Math.floor(i / cols) * (h + gapY), w, h,
      },
    })),
  }));
}
const FRAME = { deck: 0, w: 45, h: 18, cells: [] };

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SPACE — the scar above, pinned.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('every projected quantity is in PLATE space, not the design\'s', () => {
  // The static ship art rides `SHIP_XF`; the DECKS may not, because `invert` is handed root-viewBox
  // coordinates by `getScreenCTM().inverse()` (BUG-B's route, which must stay).
  assert.equal(K, VIEW_W / SRC.w);
  assert.equal(VIEW_H, Math.round(SRC.h * K));
  // BAY is BAY_D carried through the same transform the art is, so the two cannot drift.
  assert.ok(Math.abs(BAY.x - (BAY_D.x - SRC.x) * K) < 1e-9);
  assert.ok(Math.abs(BAY.y - (BAY_D.y - SRC.y) * K) < 1e-9);
  assert.ok(Math.abs(BAY.w - BAY_D.w * K) < 1e-9);
  assert.ok(Math.abs(BAY.h - BAY_D.h * K) < 1e-9);
  // ⭐ THE DECISIVE ONE, and it is what the first cut got wrong: the bay must sit INSIDE the plate's
  // own viewBox, which the design-space numbers do NOT (BAY_D.y = 110 against a 410-tall plate is
  // plausible-looking, and 33 px off).
  assert.ok(BAY.x > 0 && BAY.y > 0 && BAY.x + BAY.w < VIEW_W && BAY.y + BAY.h < VIEW_H,
    `the bay ${JSON.stringify(BAY)} is not inside the ${VIEW_W}×${VIEW_H} plate`);
  assert.notEqual(BAY.x, BAY_D.x, 'the bay is still in design space — the decks will draw off the hull');
  // …and the transform the ART uses really is the design→plate one.
  assert.equal(SHIP_XF, `scale(${K.toFixed(2)}) translate(-${SRC.x} -${SRC.y})`);
  // The gap and the floor travel with it.
  assert.ok(Math.abs(BAND_GAP - 26 * K) < 1e-9);
  assert.ok(Math.abs(MIN_BAND_H - 26 * K) < 1e-9);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE FLOOR PLANE — read off the kit, exactly invertible.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐⭐ the floor basis is READ OFF `roomFrame`, so the drawing and the click map cannot drift', () => {
  // ⛔ THE DISCIPLINE VR-P4's SEND-BACK ESTABLISHED. Review measured 57 of 59 drawn fittings clicking
  // a different tile than the one they were drawn on, because the drawing went through the oblique
  // and the click map through an axis-aligned box. The fix is not "be careful": it is that there is
  // ONE derivation and both directions solve it. This asserts the basis really is the kit's — a
  // hand-typed `[0.4, -0.6]` here would pass every round-trip test in the repo and silently stop
  // tracking `DEPTH_RATIO`.
  const band = bandLayout([0, 1]).bands[0];
  const plane = deckPlane(band);
  const dCm = DECK_M.d * 100;
  assert.ok(Math.abs(plane.BV[0] - DEPTH_RATIO.x * plane.s * dCm) < 0.02,
    'the depth vector\'s x is not `DEPTH_RATIO.x · s · beam` — the basis was re-typed');
  assert.ok(Math.abs(plane.BV[1] - DEPTH_RATIO.y * plane.s * dCm) < 0.02,
    'the depth vector\'s y is not `DEPTH_RATIO.y · s · beam` — the basis was re-typed');
  // …and the origin is the kit's own floor corner for this band.
  const f = roomFrame(1, DECK_M.d, DECK_M.h, plane.s,
    { x: BAY.x + 10 * plane.s, y: band.y + band.h - 10 * plane.s });
  assert.deepEqual(plane.O, f.project(0, 0, 0));
  // THE SCALE IS THE DESIGN'S: a band is one mini viewBox tall.
  assert.ok(Math.abs(plane.s - band.h / MINI_H) < 1e-12);
});

test('floorPoint ∘ floorSolve is the identity, and the plane is a real oblique', () => {
  const plane = deckPlane(bandLayout([0, 1]).bands[0]);
  assert.notEqual(plane.det, 0);
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.137, 0.921], [-0.2, 1.4]]) {
    const [px, py] = floorPoint(plane, u, v);
    const [bu, bv] = floorSolve(plane, px, py);
    assert.ok(Math.abs(bu - u) < 1e-9 && Math.abs(bv - v) < 1e-9, `(${u},${v}) → (${bu},${bv})`);
  }
  // Depth goes back-and-UP and the deck has height: a degenerate plane inverts fine and draws a rail.
  assert.ok(plane.BU[0] > 0 && plane.BU[1] === 0);
  assert.ok(plane.BV[0] > 0 && plane.BV[1] < 0);
  assert.ok(plane.wall > 0 && plane.across > 0 && plane.depthY > 0);
  // A degenerate band cannot make `floorSolve` throw or return NaN.
  const flat = { O: [0, 0], BU: [0, 0], BV: [0, 0], det: 0 };
  assert.deepEqual(floorSolve(/** @type {any} */ (flat), 5, 5), [0, 0]);
});

test('the band FITS: floor, depth rise and wall all land inside the band box', () => {
  // The whole of a band's drawing must lie inside `[band.y, band.y + band.h]`, because that box is
  // what `hits` uses to decide whether a press is on the plate at all. If the wall stood out of the
  // band, a press on a partition top would be refused.
  for (const n of [1, 2, 3, 8]) {
    const lay = bandLayout(Array.from({ length: n }, (_, i) => i));
    for (const band of lay.bands) {
      const p = deckPlane(band);
      const front = floorPoint(p, 0, 0)[1];
      const backTop = floorPoint(p, 0, 1)[1] - p.wall;
      assert.ok(front <= band.y + band.h + 0.01, `${n} decks: the floor hangs below its band`);
      assert.ok(backTop >= band.y - 0.01, `${n} decks: the wall stands above its band`);
      // …and horizontally inside the bay.
      assert.ok(floorPoint(p, 0, 0)[0] >= BAY.x - 0.01);
      assert.ok(floorPoint(p, 1, 1)[0] <= BAY.x + BAY.w + 0.01);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE STACK AND THE SPANS
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the stack is one band per deck, HIGHEST FIRST, and bands never overlap', () => {
  // ⭐ THE ORDER IS `deckPips`' ORDER (`sort((a,b) => b - a)`), deliberately the same expression
  // rather than a second one that happens to agree today: the deck rail is a vertical column of pips
  // painted in that order, so a plate that stacked the other way would put the rail's top pip against
  // the drawing's bottom band and nothing would catch it.
  assert.deepEqual(bandLayout([0, 1, 2]).bands.map((b) => b.deck), [2, 1, 0]);
  assert.deepEqual(bandLayout([2, 0, 1]).bands.map((b) => b.deck), [2, 1, 0]);
  assert.deepEqual(bandLayout([1, 1, 0]).bands.map((b) => b.deck), [1, 0]);
  for (const n of [1, 2, 4, 8, 20]) {
    const lay = bandLayout(Array.from({ length: n }, (_, i) => i));
    assert.equal(lay.bands.length, n);
    for (let i = 1; i < lay.bands.length; i += 1) {
      assert.ok(lay.bands[i].y >= lay.bands[i - 1].y + lay.bands[i - 1].h - 1e-9,
        `${n} decks: band ${i} overlaps band ${i - 1} — two decks would share a press`);
    }
  }
});

test('the band height has a POSITIVE FLOOR and says so when the floor binds', () => {
  // ⛔ THE UNCLAMPED ARITHMETIC GOES NEGATIVE, which is the hazard `MIN_TILE` answered on VR-P4's
  // grid and `MIN_BAND_H` answers here: a negative band inverts every rect drawn in it and is
  // trivially "inside" any containment test.
  for (const n of [1, 2, 8, 12, 20, 60, 400]) {
    const lay = bandLayout(Array.from({ length: n }, (_, i) => i));
    assert.ok(lay.h >= MIN_BAND_H, `${n} decks produced a ${lay.h} band`);
    const stack = n * lay.h + (n - 1) * lay.gap;
    assert.equal(stack <= BAY.h + 0.01, !lay.overflows,
      `${n} decks: overflows=${lay.overflows} but the stack is ${stack} in a ${BAY.h} bay`);
  }
  // THE CROSSING, written out so an edit to the floor, the gap or the bay cannot move it quietly.
  assert.equal(bandLayout([0, 1]).overflows, false, 'the wreck\'s two decks no longer fit');
  assert.equal(bandLayout([0, 1, 2, 3, 4, 5, 6, 7]).overflows, true, 'eight decks now fit — untested');
  for (const bad of [null, undefined, NaN, -3, 'x', {}]) {
    const lay = bandLayout(/** @type {any} */ (bad));
    assert.ok(lay.bands.length === 1 && lay.h > 0 && Number.isFinite(lay.h));
  }
});

test('spans are PROPORTIONAL to tile spans, contiguous, and complete', () => {
  // The owner's dimensional-honesty caveat, satisfied by construction. A ratio assertion, so it
  // cannot be satisfied by a fixture whose compartments happen to be equal.
  //
  // ⛔⛔ AND THAT LAST SENTENCE IS THE ONLY REASON THE PROPERTY IS PINNED AT ALL — **IT IS VACUOUS ON
  // EVERY SHIP THE GAME ACTUALLY BOOTS**, and saying so is the point of this paragraph. Measured off
  // the running `decks` channel on 2026-08-05, not inferred:
  //
  //     --ship wreck  16 compartments over 2 decks — ALL 12 tiles wide (`12x8` each, both banks)
  //     --ship grid   64 compartments over 8 decks — ALL 12 tiles wide
  //
  // So on both of them every `uSpan` is exactly 1/8 and a build that divided the band EQUALLY —
  // ignoring `rect.w` entirely — would draw the identical picture and pass every live rig this repo
  // has. THE SYNTHETIC 6/12/18 FIXTURE BELOW IS THE PROPERTY'S ONLY INSTRUMENT. Do not let a
  // screenshot, a press census, or `overview-plate-shot.mjs` be read as evidence that dimensional
  // honesty holds; none of them can distinguish it from equal thirds. If a later lane authors a ship
  // with unequal compartments, that ship becomes the first live witness and should be said so here.
  const slots = [
    { slotIndex: 0, anchorName: 'a', rect: { x: 0, y: 0, w: 6, h: 8 } },
    { slotIndex: 1, anchorName: 'b', rect: { x: 6, y: 0, w: 12, h: 8 } },
    { slotIndex: 2, anchorName: 'c', rect: { x: 18, y: 0, w: 18, h: 8 } },
  ];
  const spans = slotSpans(slots);
  assert.deepEqual(spans.map((s) => +(s.u1 - s.u0).toFixed(6)), [0.166667, 0.333333, 0.5]);
  assert.equal(spans[0].u0, 0);
  assert.ok(Math.abs(spans[2].u1 - 1) < 1e-12);
  for (let i = 1; i < spans.length; i += 1) assert.equal(spans[i].u0, spans[i - 1].u1);
  // A slot the wire gave no geometry gets NO span: inventing a width would put a pressable
  // compartment on the plate that the ship does not have.
  assert.equal(slotSpans([...slots, { slotIndex: 3, rect: { x: 0, y: 0, w: 0, h: 0 } }]).length, 3);
  assert.deepEqual(slotSpans([]), []);
  assert.deepEqual(slotSpans(/** @type {any} */ (null)), []);
  assert.deepEqual(slotSpans([{ slotIndex: 0 }]), []);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE TRANSFORM — the contract itself.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐⭐ project ∘ invert is the identity for EVERY TILE OF EVERY DECK — the full census', () => {
  // Not a sample. The elevation makes this cheap enough to assert exhaustively, and it is what
  // caught the region-boundary precision hole (a compartment tile on its rect's FRONT edge projects
  // to exactly `v = V_SPINE`, and the float landed below it as often as on it, sending the point to
  // the walkway branch — tile (0,0) came back as (0,18)).
  const view = ship(2, 8, 12, 8, 2);
  const t = makeShipTransform(view, FRAME);
  const bad = [];
  let checked = 0;
  for (const deck of t.deckOrder) {
    for (let ty = 0; ty < FRAME.h; ty += 1) {
      for (let tx = 0; tx < FRAME.w; tx += 1) {
        const [sx, sy] = t.project(tx + 0.5, ty + 0.5, deck);
        const [bx, by, bd] = t.invert(sx, sy);
        checked += 1;
        if (Math.floor(bx) !== tx || Math.floor(by) !== ty || bd !== deck) {
          bad.push(`d${deck} ${tx},${ty} → ${bx.toFixed(4)},${by.toFixed(4)} d${bd}`);
        }
      }
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} of ${checked} tiles did not round-trip`);
  assert.equal(checked, 2 * FRAME.w * FRAME.h);
});

test('THE REGION BOUNDARY: a compartment\'s FRONT EDGE tile stays in its compartment', () => {
  // The precision hole above, driven directly rather than through the census — so a regression names
  // itself instead of arriving as one entry in a list of thousands.
  const view = ship(1, 8, 12, 8, 2);
  const t = makeShipTransform(view, FRAME);
  const rect = view[0].slots[0].rect;
  for (let tx = rect.x; tx < rect.x + rect.w; tx += 1) {
    // ty = rect.y is the row whose v maps to EXACTLY V_SPINE.
    const uv = t.tileUV(tx, rect.y, 0);
    assert.ok(Math.abs(uv[1] - V_SPINE) < 1e-12, 'the fixture no longer probes the boundary');
    const [sx, sy] = t.project(tx, rect.y, 0);
    const [bx, by] = t.invert(sx, sy);
    assert.ok(by >= rect.y - 1e-6 && by < rect.y + rect.h,
      `the front-edge tile ${tx},${rect.y} inverted to ty=${by} — it fell through to the walkway, `
      + 'which re-maps over the deck\'s WHOLE ty extent');
    assert.ok(Math.abs(bx - tx) < 1e-6);
  }
});

test('THE TWO REGIONS are separated by v, and every deck tile is in exactly one', () => {
  const view = ship(2, 8, 12, 8, 2);
  const t = makeShipTransform(view, FRAME);
  const covers = (deck, tx, ty) => view[deck].slots.some((s) => tx >= s.rect.x && tx < s.rect.x + s.rect.w
    && ty >= s.rect.y && ty < s.rect.y + s.rect.h);
  let inRoom = 0, onWalk = 0;
  for (const deck of t.deckOrder) {
    for (let ty = 0; ty < FRAME.h; ty += 1) {
      for (let tx = 0; tx < FRAME.w; tx += 1) {
        const v = t.tileUV(tx + 0.5, ty + 0.5, deck)[1];
        if (covers(deck, tx, ty)) { assert.ok(v >= V_SPINE); inRoom += 1; } else { assert.ok(v < V_SPINE); onWalk += 1; }
      }
    }
  }
  assert.ok(inRoom > 200 && onWalk > 100, `regions are lopsided (${inRoom}/${onWalk}) — the fixture is odd`);
});

test('⛔ `hits` bounds the plate: outside every band is not a tile', () => {
  // The guard that keeps the paper margin un-orderable. `invert` CLAMPS to the floor on purpose and
  // `deckAt` takes the NEAREST band, so without a container every point of empty paper resolved to a
  // real tile and an armed DIG would have designated it.
  const t = makeShipTransform(ship(2), FRAME);
  const b = t.deckInfo(0).band;
  assert.equal(t.hits(BAY.x + 5, b.y + 5), true);
  assert.equal(t.hits(BAY.x - 5, b.y + 5), false, 'a point left of the bay is on the plate');
  assert.equal(t.hits(BAY.x + BAY.w + 5, b.y + 5), false);
  assert.equal(t.hits(BAY.x + 5, 0), false, 'a point above every band is on the plate');
  assert.equal(t.hits(BAY.x + 5, VIEW_H), false);
  // …and the GAP between two bands is not on the plate either — a press there addresses nothing.
  const top = t.deckInfo(1).band;
  const mid = top.y + top.h + (b.y - (top.y + top.h)) / 2;
  assert.equal(t.hits(BAY.x + 5, mid), false, 'the inter-deck gap resolves to a tile');
  // ⚠️ AND `invert` STAYS TOTAL, which is why the bound is a separate function: it is the round
  // trip's inverse and must answer for every input.
  assert.ok(Number.isFinite(t.invert(-500, -500)[0]));
});

test('a deck the transform does not draw is not projectable, and does not throw', () => {
  const t = makeShipTransform(ship(2), FRAME);
  assert.equal(t.deckInfo(9), null);
  assert.ok(Number.isNaN(t.project(0, 0, 9)[0]), 'a deck that is not drawn produced a coordinate');
  assert.equal(t.tileUV(0, 0, 9), null);
  assert.equal(t.cellOf(null, 0), null);
  assert.doesNotThrow(() => makeShipTransform(/** @type {any} */ (null), null));
  assert.doesNotThrow(() => makeShipTransform([], null));
  assert.doesNotThrow(() => makeShipTransform([{ deck: 0, slots: null }], null));
});

test('cellOf / spanBox describe the SAME region the projection draws into', () => {
  // ⭐ ONE DERIVATION FOR THE DRAWING, THE LENS WASH AND THE SELECTION OUTLINE. `lensOverlaySvg`
  // lays its tint over `cellOf`; a second box computed anywhere else is how a wash comes to land
  // beside the compartment it is grading (VR-P4 measured exactly that, from the other direction).
  const view = ship(2);
  const t = makeShipTransform(view, FRAME);
  for (const deck of t.deckOrder) {
    const info = t.deckInfo(deck);
    for (const sp of info.spans) {
      const box = t.cellOf(sp.slot, deck);
      assert.deepEqual(box, spanBox(info, sp), 'cellOf and spanBox disagree about the same span');
      // Every tile of the slot projects inside its own box.
      // ⚠️ THE SAMPLES START AT 1.5, NOT 0.5, AND THAT IS A FACT ABOUT THE SHIP RATHER THAN A
      // CONVENIENCE. Adjacent compartments SHARE A WALL COLUMN on every authored ship (the wreck's
      // slots run x 0..12 and 11..23), so a tile in the shared column is covered by TWO rects and
      // `tileUV` resolves it to the FIRST — the only answer an ordered map can give, and the reason
      // `hitTest`'s DOM tier and not this arithmetic decides which room a click ENTERS. Sampling the
      // shared column would be asserting that the tie is broken the other way.
      for (const [dx, dy] of [[1.5, 0.5], [sp.rect.w - 0.5, 0.5], [1.5, sp.rect.h - 0.5]]) {
        const [sx, sy] = t.project(sp.rect.x + dx, sp.rect.y + dy, deck);
        assert.ok(sx >= box.x - 0.01 && sx <= box.x + box.w + 0.01
          && sy >= box.y - 0.01 && sy <= box.y + box.h + 0.01,
        `${sp.slot.anchorName}: tile ${dx},${dy} landed outside its own region`);
      }
    }
    // …and a slot resolved by ANCHOR NAME rather than by identity gets the same answer, because the
    // view is rebuilt from the wire every repaint and object identity does not survive that.
    const byName = t.cellOf({ ...info.spans[0].slot }, deck);
    assert.deepEqual(byName, t.cellOf(info.spans[0].slot, deck));
  }
});

test('tileSize is the ACROSS span, not the compressed depth — the 4× that drew empty rooms', () => {
  // ⛔ MEASURED, not preferred. On an oblique floor the two axes are deliberately unequal: a wreck
  // compartment is ~12 tiles across ~113 px (9.4 a tile) and 8 tiles deep through ~18 px of DEPTH
  // RISE (2.3 a tile). Taking `min` sized every fitting by the compressed axis, every piece clamped
  // to the composer's floor, and the compartments photographed as empty rooms.
  const view = ship(2, 8, 12, 8, 2);
  const t = makeShipTransform(view, FRAME);
  const info = t.deckInfo(0);
  const sp = info.spans[0];
  const across = (sp.u1 - sp.u0) * info.plane.across / sp.rect.w;
  const depth = (1 - V_SPINE) * info.plane.depthY / sp.rect.h;
  assert.ok(across > depth * 2,
    `the two axes are no longer unequal (${across} vs ${depth}) — this test cannot see the mistake`);
  assert.ok(Math.abs(t.tileSize - across) < 1e-9,
    `tileSize is ${t.tileSize}, not the across span ${across} — art will be sized by the compressed axis`);
  assert.ok(t.tileSize >= 2.5, 'the floor is gone; a degenerate ship would size every piece to nothing');
});
