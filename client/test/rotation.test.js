// ⭐⭐ 4× ROTATION — "I want to be able to rotate it" (the owner, 2026-08-05), driven end to end.
//
// THE SHAPE OF THE FEATURE, so the tests below read as a chain rather than a list:
//   [E] cycles `_facing` → the GHOST redraws turned → `Cmd.place` carries it → the sim stores it
//   (`Device.Facing`, DEVC v7, folded at bits 13–14 — `tests/Perilune.Tests/DeviceFacingTests.cs`)
//   → the `devices` channel's eleventh element brings it back → BOTH SVG surfaces join it on (x,y)
//   and draw the piece turned.
//
// ⛔ WHERE THE TURN ACTUALLY HAPPENS, AND WHY THAT IS THE THING WORTH PINNING. It is ONE map, in the
// ENV FRAME (`oblique.roomFrame`'s `plan`): a builder's centimetres are swapped and mirrored BEFORE
// they are projected. So thirty hand-authored fitting builders — ~1200 lines of cm points — turn
// without one of them knowing rotation exists, and `oblique.js`'s own "this module has no `rotate`"
// stays true: the PROJECTION still has none. Section 1 drives that map directly, because everything
// else in this file is downstream of it and a subtly wrong quarter-turn would look plausible in all
// of them.
//
// ⚠️ AND THE HALF THAT IS **NOT** IMPLEMENTED IS ASSERTED TOO (section 5): facing is DRAWING-ONLY.
// The sim reads it nowhere, there are no footprints, and a multi-tile piece just extends the other
// way. RimWorld couples rotation to the interaction cell; ours does not, and the day it does the
// test that must go red is the one that says so out loud.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { roomFrame, PX_PER_CM } from '../src/render/oblique.js';
import { SPECS, FITTING_IDS, frameFor, roomBox, geometryFor, BOX } from '../src/items/fittings.js';
import * as PaperFixtures from '../src/items/paper-fixtures.js';
import * as Machines from '../src/items/machines.js';
import * as PaperResources from '../src/items/paper-resources.js';
import { buildItem, ITEMS } from '../src/items/index.js';
import { decode, decodeDecks, decodeRooms, decodeDevices } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  deckSlots, roomScene, scenePlacement, roomDeviceConditions, deckDeviceConditions, ZOOM_HINT_ARMED,
  ROOM_SCALE,
} from '../src/ui/room-model.js';
import { Cmd } from '../src/wire/session.js';
import { overviewScene } from '../src/ui/overview-scene.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { codeOnly } from './code-only.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE MAP — one quarter-turn, in the frame, and facing 0 is the IDENTITY
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('facing 0 is byte-identical to no facing at all — every existing caller is untouched', () => {
  // ⛔ THE FIRST THING TO PROVE, because it is what makes this change safe for the room cutaway, the
  // plate, the catalogue sheet and the four surfaces that never pass a facing. If it were not exact,
  // the whole visual redesign would have moved by a rounding error nobody asked for.
  const a = roomFrame(8.6, 2.8, 2.4, 0.95, { x: 58, y: 452 });
  const b = roomFrame(8.6, 2.8, 2.4, 0.95, { x: 58, y: 452, facing: 0 });
  for (const [x, y, z] of [[0, 0, 0], [860, 280, 240], [123, 45, 67], [-5, 900, 12]]) {
    assert.deepEqual(b.project(x, y, z), a.project(x, y, z));
  }
  assert.deepEqual(b.corners, a.corners);
  assert.equal(b.wCm, a.wCm);
  assert.equal(b.dCm, a.dCm);
  // …and `boxAt` agrees with `project` at facing 0, which is what lets `bx()` route through it
  // unconditionally instead of branching on the facing.
  const box = a.boxAt(100, 50, 10, 60, 40);
  assert.deepEqual([box.x, box.y], a.project(100, 50, 10));
  assert.equal(box.w, 60);
  assert.equal(box.d, 40);
});

test('the plan map is a real quarter-turn: the box\'s four corners map onto the faced box', () => {
  // A 200 × 60 footprint. Facing k must send the authored rect onto exactly the faced rect —
  // 200 × 60 at 0/2, 60 × 200 at 1/3 — with the corners in the right places, not merely in range.
  const W = 200, D = 60;
  const f = (k) => roomFrame(W / 100, D / 100, 1, 1, { x: 0, y: 0, facing: k });
  assert.deepEqual(f(0).plan(0, 0), [0, 0]);
  assert.deepEqual(f(0).plan(W, D), [W, D]);
  assert.deepEqual(f(1).plan(0, 0), [D, 0]);        // near-left  → far-left of a D×W box
  assert.deepEqual(f(1).plan(W, D), [0, W]);
  assert.deepEqual(f(2).plan(0, 0), [W, D]);        // the 180° flip
  assert.deepEqual(f(2).plan(W, D), [0, 0]);
  assert.deepEqual(f(3).plan(0, 0), [0, W]);
  assert.deepEqual(f(3).plan(W, D), [D, 0]);
  // The FACED footprint the frame reports — swapped on odd, untouched on even.
  assert.deepEqual([f(0).wCm, f(0).dCm], [W, D]);
  assert.deepEqual([f(1).wCm, f(1).dCm], [D, W]);
  assert.deepEqual([f(2).wCm, f(2).dCm], [W, D]);
  assert.deepEqual([f(3).wCm, f(3).dCm], [D, W]);
});

test('four quarter-turns return exactly where they started — the cycle really closes', () => {
  // ⭐ THE OWNER ASKED FOR **4×** ROTATION, and this is what that sentence means arithmetically: the
  // map composed with itself four times is the identity. A map that was off by one axis somewhere
  // would still produce four distinct pictures and would NOT close, and nothing that only compares
  // adjacent facings could see the difference.
  // Composed from the SHIPPED `plan`s in sequence, box dimensions carried along — never from a
  // restatement of the map here, which would only prove this file agrees with itself.
  const W = 200, D = 60;
  let pt = [37, 11];
  let box = [W, D];
  for (let i = 0; i < 4; i++) {
    const fr = roomFrame(box[0] / 100, box[1] / 100, 1, 1, { x: 0, y: 0, facing: 1 });
    pt = fr.plan(pt[0], pt[1]);
    box = [fr.wCm, fr.dCm];
  }
  assert.deepEqual(pt, [37, 11], 'four quarter-turns are not the identity');
  assert.deepEqual(box, [W, D], 'four quarter-turns did not restore the footprint');
});

test('the map is applied to a BOX\'s extents, not only to its origin — bx()\'s own hazard', () => {
  // ⛔ THIS IS THE ONE PLACE THE FACING COULD HAVE BEEN SILENTLY MISSED. `oblique.box()` draws an
  // axis-aligned extrusion from a projected origin plus RAW cm extents; the extents never pass
  // through `plan`. A projected-only origin therefore puts a turned bench in exactly the right place
  // with exactly the wrong footprint — the whole piece correct except that it still runs the old way,
  // which reads as "rotation does not work on wide things" and looks like an art bug.
  const fr = roomFrame(2, 0.6, 1, 1, { x: 0, y: 0, facing: 1 });
  const b = fr.boxAt(0, 0, 0, 200, 60);
  assert.equal(b.w, 60, 'the box\'s WIDTH did not swap with its depth on an odd facing');
  assert.equal(b.d, 200);
  // …and the origin is the MINIMUM corner of the mapped rect, not the mapped minimum corner.
  const mapped = [fr.plan(0, 0), fr.plan(200, 60)];
  const minX = Math.min(mapped[0][0], mapped[1][0]);
  assert.equal(b.x, fr.x0 + minX + 0.4 * Math.min(mapped[0][1], mapped[1][1]));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE PIECES — thirty builders turn, and the scale does NOT
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐⭐ A TURNED PIECE IS THE SAME SIZE — a 260 cm bench is 260 cm of floor at every facing', () => {
  // ⛔ THE 7TH TRAP SHAPE, CLOSED BY AN ABSOLUTE ASSERTION. `roomBox` inverts the drawing scale to
  // land a piece at `s` px/cm, and the drawing scale is derived from the FACED footprint. Hand the
  // facing to one derivation and not the other and a rotated bench is drawn at a different metre —
  // an error no ratio comparison and no "the four pictures differ" test could see.
  const s = PX_PER_CM.room;
  for (const id of FITTING_IDS) {
    const spec = SPECS[id];
    for (const f of [0, 1, 2, 3]) {
      const rb = roomBox(id, s, f);
      const fr = frameFor(id, f);
      // The builder draws at `fr.s` px/cm inside a `TILE`-normalised box of side `rb.side`;
      // `helpers.render` scales by `min(w,h)/TILE`, so the on-screen rule is `fr.s * side / 128`.
      const onScreen = (fr.s * rb.side) / 128;
      assert.ok(Math.abs(onScreen - s) < 1e-9,
        `${id} at facing ${f} lands at ${onScreen} px/cm instead of ${s} — a turned piece changed size`);
      // …and the FACED footprint is the authored one, swapped on odd facings and never rescaled.
      assert.equal(rb.wCm, (f & 1) ? spec.d : spec.w, `${id} facing ${f}: wCm`);
      assert.equal(rb.dCm, (f & 1) ? spec.w : spec.d, `${id} facing ${f}: dCm`);
    }
  }
});

test('every non-square fitting draws four DIFFERENT pictures, and is deterministic at each', () => {
  let turned = 0;
  for (const id of FITTING_IDS) {
    const draw = (f) => buildItem(id, { w: 240, h: 240, idPrefix: 'r', facing: f });
    const svg = [0, 1, 2, 3].map(draw);
    assert.equal(draw(1), svg[1], `${id} is not deterministic at facing 1`);
    assert.ok(!/NaN|undefined/.test(svg.join('')), `${id} emitted NaN/undefined at some facing`);
    // A SQUARE-FOOTPRINT piece may legitimately look identical at 0 and 2 (a symmetric drawing in a
    // symmetric box), so the claim is scoped to pieces whose footprint is not square. The count at
    // the end is the non-vacuity: this must not silently become an empty sweep.
    if (SPECS[id].w !== SPECS[id].d) {
      assert.notEqual(svg[1], svg[0], `${id}: facing 1 draws the same picture as facing 0`);
      assert.notEqual(svg[3], svg[0], `${id}: facing 3 draws the same picture as facing 0`);
      turned++;
    }
  }
  assert.ok(turned >= 20, `non-vacuity: only ${turned} non-square fittings were swept`);
});

test('ROUND THINGS STAY LEVEL — a turned barrel has no heading, at any facing', () => {
  // The catalogue's own rule ("a round fitting has no heading and can be set down any way about") is
  // preserved BY CONSTRUCTION rather than by thirty re-checks: a level ellipse is drawn axis-aligned
  // in SCREEN space from `F.s * rCm`, so only its CENTRE goes through the plan map.
  //
  // ⚠️ THE CLAIM IS THE **RATIO**, NOT THE RADII, AND THE FIRST DRAFT GOT THIS WRONG. It asserted
  // that the radii were byte-identical at every facing and went red on `vice-post` — which is
  // ∅40 × 120 inside a 58 × 40 DRAWN box (its jaw handle sticks out), so its box is NOT square, the
  // faced footprint differs, and the piece fills the 128-unit tile at a different drawing scale. The
  // radii SHOULD change there; what must not change is that the ellipse is level. The absolute size
  // on screen is the separate claim, and it is pinned as such by the true-centimetre test above.
  const ratios = (svg) => [...svg.matchAll(/rx="([\d.]+)" ry="([\d.]+)"/g)]
    .map((m) => Math.round((Number(m[2]) / Number(m[1])) * 1000) / 1000);
  let swept = 0;
  for (const id of FITTING_IDS.filter((i) => SPECS[i].round)) {
    const at = (f) => ratios(buildItem(id, { w: 240, h: 240, idPrefix: 'r', facing: f }));
    assert.ok(at(0).length > 0, `${id} is marked round but emits no ellipse — this sweep is vacuous`);
    for (const f of [1, 2, 3]) {
      assert.deepEqual(at(f), at(0),
        `${id}: a quarter-turn changed a level ellipse's ry/rx — the round-objects rule is broken`);
      // 0.6 is `|DEPTH_RATIO.y|` — a level circle in cabinet oblique. Anything else is a heading.
      for (const r of at(f)) assert.equal(r, 0.6, `${id} facing ${f}: an ellipse is no longer level`);
    }
    swept++;
  }
  assert.ok(swept >= 5, `non-vacuity: only ${swept} round fittings were swept`);
  // …and NO builder emits a rotate transform: the turn is in the coordinates, never in the camera.
  for (const id of FITTING_IDS) {
    const svg = buildItem(id, { w: 240, h: 240, idPrefix: 'r', facing: 1 });
    assert.ok(!/transform="[^"]*rotate\((?!45)/.test(svg),
      `${id} emits a rotate() at facing 1 — the quarter-turn must live in the cm coordinates, not in `
      + 'a transform (the 45° hatch pattern is the one legitimate rotate in this set)');
  }
});

test('NO FITTING EMITS TEXT, so the "labels must stay upright" rule has nothing to break yet', () => {
  // ⚠️ THE CENSUS IS THE POINT, NOT THE ABSENCE. Rotation happens in the cm frame, so a `<text>`
  // placed through `F.project` would move with the piece but never shear (SVG text is not rotated by
  // a coordinate swap) — upright by construction TODAY. This pin exists so that the day a builder
  // does emit a label, someone has to come back and decide where it goes at facing 2, instead of
  // discovering it in a screenshot.
  const src = readFileSync(join(HERE, '../src/items/fittings.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(!/\bs\.text\(|<text\b/.test(code),
    'a fitting builder now emits TEXT. Rotation is a swap of the piece\'s own centimetres, so the '
    + 'label will move with the piece and stay upright — but WHERE it lands at each facing is a '
    + 'drawing decision nobody has made. Make it, then update this pin.');
  // Non-vacuity: the stripper must not have eaten the file.
  assert.ok(code.includes('export function frameFor'), 'the comment stripper removed live code');
});

test('⭐⭐ THE DRAWN INK REALLY TURNS — a turned bench runs the OTHER WAY, not merely elsewhere', () => {
  // ⛔⛔ THIS TEST EXISTS BECAUSE A NAMED MUTATION CAME BACK **GREEN** (2026-08-05, measured, not
  // anticipated). Mutation J1 — `bx()` projecting its origin through the faced frame but handing
  // `oblique.box()` the RAW `w`/`d` — left the whole suite passing. The sibling leg above drives
  // `roomFrame.boxAt` DIRECTLY, so it pins the PRIMITIVE and is blind to a CONSUMER that stops
  // calling it; and "four different pictures" still holds, because every box ORIGIN still moves.
  // The result is a bench drawn at the right scale, in the right place, RUNNING THE WRONG WAY —
  // exactly the defect `bx`'s own comment describes, invisible to the tests written beside it.
  // That is CLAUDE.md's 4th trap shape (a guard whose scope excludes the violation).
  //
  // ⇒ THE CLAIM HERE IS THE SHAPE OF THE INK, measured off the emitted path data: the bounding box
  // of everything the builder drew must match the FACED extents' own aspect ratio. A box whose
  // extents never turned overflows that ratio and cannot be made to fit it.
  const inkBox = (svg) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
      const nums = m[1].match(/-?\d+(?:\.\d+)?/g) || [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = Number(nums[i]), y = Number(nums[i + 1]);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { w: x1 - x0, h: y1 - y0 };
  };
  // Four BOX-BUILT pieces whose footprint is emphatically not square, so the faced aspect ratio
  // really moves. (A path-only or round piece would prove nothing about `bx`.)
  let checked = 0;
  for (const id of ['bench', 'dining-table', 'cot', 'locker']) {
    const spec = SPECS[id];
    for (const f of [0, 1]) {
      const fw = (f & 1) ? spec.d : spec.w;
      const fd = (f & 1) ? spec.w : spec.d;
      const z0 = spec.z0 == null ? 0 : spec.z0;
      const ex = fw + 0.4 * fd;                     // the oblique's across-extent, in cm
      const ey = (spec.h - z0) + 0.6 * fd;          // …and its up-extent
      const box = inkBox(buildItem(id, { w: 400, h: 400, idPrefix: 'k', facing: f }));
      const drawn = box.w / box.h;
      const want = ex / ey;
      assert.ok(Math.abs(drawn - want) / want < 0.12,
        `${id} at facing ${f}: the drawn ink is ${drawn.toFixed(3)} wide-over-tall but the FACED box `
        + `is ${want.toFixed(3)}. The extrusion's extents did not turn with the piece — it is in the `
        + 'right place at the right scale, running the wrong way.');
      checked++;
    }
    // …and the ratio must actually FLIP between the two facings, or the tolerance above is doing
    // nothing (non-vacuity for the whole loop).
    const r0 = (() => { const b = inkBox(buildItem(id, { w: 400, h: 400, idPrefix: 'k', facing: 0 })); return b.w / b.h; })();
    const r1 = (() => { const b = inkBox(buildItem(id, { w: 400, h: 400, idPrefix: 'k', facing: 1 })); return b.w / b.h; })();
    assert.ok(Math.abs(r1 - r0) / r0 > 0.25, `${id}: the drawn aspect barely moved (${r0} → ${r1})`);
  }
  assert.equal(checked, 8, 'non-vacuity: the sweep ran');
});

/** The bounding box of everything a builder actually drew, in the builder's OWN units (the path data
 *  is emitted pre-transform, so these are directly comparable to `geometryFor(...).extent`). */
function inkBox(svg) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
    const nums = m[1].match(/-?\d+(?:\.\d+)?/g) || [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]), y = Number(nums[i + 1]);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { w: x1 - x0, h: y1 - y0 };
}

test('⭐⭐ A TURNED PIECE STILL FILLS ITS BOX — the drawn ink matches the FACED extent it declares', () => {
  // ⛔⛔ THIS TEST EXISTS BECAUSE A MUTATION CAME BACK GREEN ON THE MERGED TREE (J2, 2026-08-05):
  // `geometryFor` deriving `ex`/`ey`/`k` from the UNFACED spec while still handing `roomFrame` the
  // facing. Everything downstream stayed SELF-CONSISTENT and therefore silent — `roomBox` inverts
  // the same wrong `k`, so the absolute px/cm leg still reads exactly `s`; `extent` is `k·ex` with
  // BOTH terms unfaced, so its larger axis is still `BOX`; and the aspect-ratio leg still passes
  // because the plan map really did turn. The piece was simply drawn at the wrong scale INSIDE its
  // own tile: measured, a turned bench came out 56 units wide where it declares 77, and a turned
  // locker came out 126 tall in a 112 box — i.e. UNDER-FILLED on one piece and CLIPPING on another.
  //
  // ⇒ THE CLAIM IS THE ONE RELATION NOTHING ELSE COMPARES: what the builder DREW against what
  // `geometryFor` SAYS it should occupy, at the same facing. Those are the two halves the split
  // separates, and comparing either to itself is what let the split hide.
  // ⇒ THE STATISTIC IS THE **FILL RATIO** — how much of its declared box a piece's ink actually
  // occupies in its dominant axis — and it is compared ACROSS FACINGS of the same piece. That is the
  // one number the split moves and nothing else does: a piece's ink-inside-box fraction is a
  // property of the DRAWING, so it must not care which way the drawing is turned. An absolute
  // per-piece tolerance was tried first and rejected — it has to be loose enough for the workbench's
  // pegboard (which legitimately fills 86 of its 112) and that same looseness lets the mutation
  // through, so it would have been a guard tuned until it stopped working.
  //
  // MEASURED, both trees, to pick the band rather than guess it:
  //   shipped : every piece, every facing → 0.904 … 1.000
  //   with J2 : odd facings → 0.680 / 0.706 / 0.815 (under-filled) and 1.092 … 1.273 (CLIPPING)
  const LO = 0.88, HI = 1.02;
  let checked = 0;
  for (const id of ['bench', 'dining-table', 'cot', 'locker', 'shelf-rack', 'workbench']) {
    for (const f of [0, 1, 2, 3]) {
      const want = geometryFor(SPECS[id], f).extent;
      const got = inkBox(buildItem(id, { w: 128, h: 128, idPrefix: 'e', facing: f }));
      const fill = Math.max(got.w, got.h) / Math.max(want.w, want.h);
      assert.ok(fill >= LO && fill <= HI,
        `${id} facing ${f}: fills ${fill.toFixed(3)} of its declared box (band ${LO}..${HI}). The `
        + 'drawing scale and the declared extent disagree — the piece is mis-sized inside its own '
        + 'tile, and every SELF-consistent check (px/cm, aspect ratio, extent) stays green through '
        + `it. Drew ${got.w.toFixed(0)}x${got.h.toFixed(0)}, declares ${want.w}x${want.h}.`);
      // …and the clipping half, stated absolutely: nothing may overflow the box it normalises into.
      assert.ok(Math.max(got.w, got.h) <= BOX * HI,
        `${id} facing ${f}: ink ${got.w.toFixed(0)}x${got.h.toFixed(0)} overflows BOX=${BOX} — it clips`);
      checked++;
    }
  }
  assert.equal(checked, 24, 'non-vacuity: the sweep ran');
});

/** Every catalogue that draws through `fittings.geometryFor`, as `[name, ids, specs]`. Derived from
 *  the modules' own exports, so a FIFTH catalogue joins the sweep by existing rather than by being
 *  remembered — which is the whole failure mode this list exists to close. */
const CATALOGUES = [
  ['paper-fixtures', PaperFixtures.FIXTURE_IDS || Object.keys(PaperFixtures.SPECS), PaperFixtures.SPECS],
  ['machines', Machines.MACHINE_IDS || Object.keys(Machines.SPECS), Machines.SPECS],
  ['paper-resources', PaperResources.RESOURCE_IDS || Object.keys(PaperResources.SPECS), PaperResources.SPECS],
];

test('⭐⭐ EVERY OTHER CATALOGUE TURNS TOO — they all reach the facing through the shared door', () => {
  // ⛔⛔ AND THIS ONE EXISTS BECAUSE J11 CAME BACK GREEN. Dropping the facing from
  // `paper-fixtures.frameFor` left every suite passing: main's `paper-fixtures.test.js` predates
  // rotation and this file's own sweeps walked `FITTING_IDS` only. The result would have been ONE
  // rotation verb that works on 34 pieces and silently does nothing on the other 14 — the exact
  // asymmetry the merge resolution threaded `facing` through `geometryFor` to prevent, left unpinned.
  // ⛔⛔ THE SWEEP IS OVER **EVERY** CATALOGUE BECAUSE THE HOLE KEEPS COMING BACK. It was written for
  // `paper-fixtures` after mutation J11 came back GREEN, and at the very next merge `machines.js`
  // (13 pieces) and `paper-resources.js` (9) arrived carrying the SAME shape — each with a private
  // copy of `extents`/`scaleOf` and its own facing-less `roomFrame`. Nothing was red; a new
  // catalogue simply cannot turn, silently, and only a sweep that enumerates them all notices.
  let turned = 0, square = 0, swept = 0;
  for (const [name, ids, specs] of CATALOGUES) {
    assert.ok(ids.length >= 5, `non-vacuity: ${name} has pieces (${ids.length})`);
    for (const id of ids) {
      const sp = specs[id];
      const at = (f) => buildItem(id, { w: 240, h: 240, idPrefix: 'pf', facing: f });
      assert.equal(at(1), buildItem(id, { w: 240, h: 240, idPrefix: 'pf', facing: 1 }),
        `${name}/${id} is not deterministic at facing 1`);
      assert.ok(!/NaN|undefined/.test(at(0) + at(1) + at(2) + at(3)),
        `${name}/${id} emitted NaN at some facing`);
      // Facing 0 must remain byte-identical to no facing at all — the compatibility half.
      assert.equal(at(0), buildItem(id, { w: 240, h: 240, idPrefix: 'pf' }),
        `${name}/${id}: passing facing 0 is not the same as passing no facing`);
      if (sp.w !== sp.d) {
        assert.notEqual(at(1), at(0), `${name}/${id}: a quarter-turn draws the same picture as facing 0`);
        assert.notEqual(at(3), at(0), `${name}/${id}: a three-quarter turn draws the same picture as facing 0`);
        turned++;
      } else square++;
      swept++;
    }
  }
  assert.ok(swept >= 30, `non-vacuity: only ${swept} pieces swept across ${CATALOGUES.length} catalogues`);
  assert.ok(turned >= 25, `non-vacuity: only ${turned} non-square pieces turned (${square} square)`);
});

test('NO CATALOGUE KEEPS A PRIVATE FRAME DERIVATION — they all go through geometryFor', () => {
  // ⛔ THE STRUCTURAL HALF of the sweep above: the behaviour test says "these pieces turn today",
  // this says "and none of them can quietly stop". A module that builds its OWN `roomFrame` inside
  // its `frameFor` has by construction no way to receive a facing, which is precisely how machines
  // and paper-resources arrived. Comment-stripped (trap 1) with a negative control.
  for (const f of ['paper-fixtures', 'machines', 'paper-resources']) {
    const code = codeOnly(readFileSync(join(HERE, `../src/items/${f}.js`), 'utf8'));
    const frameFn = /export function frameFor(?:Spec)?\([\s\S]{0,600}?\n\}/.exec(code);
    assert.ok(frameFn, `${f}: no frameFor to inspect — this guard has rotted`);
    assert.ok(/geometryFor\s*\(/.test(frameFn[0]),
      `${f}'s frameFor does not go through fittings.geometryFor — it has a private derivation again, `
      + 'so its pieces cannot receive a facing and will silently never turn');
    assert.ok(!/roomFrame\s*\(/.test(frameFn[0]),
      `${f}'s frameFor builds its own roomFrame — the facing has nowhere to enter`);
  }
  // NEGATIVE CONTROL: the detector must fire on the shape it is looking for.
  const bad = 'export function frameFor(id) {\n  return roomFrame(1, 1, 1, 1, {});\n}';
  assert.ok(/roomFrame\s*\(/.test(bad) && !/geometryFor\s*\(/.test(bad),
    'the private-derivation detector cannot detect a private derivation');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE WIRE — the facing comes back and both surfaces read it
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the devices channel carries the facing, and both reducers keep it', () => {
  const rows = decodeDevices({ type: 'devices', cells: [[4, 5, 1, 18, 255, 1, 0, 1, 1, -1, 3]] });
  assert.equal(rows[0].face, 3);
  const room = roomDeviceConditions(rows, { deck: 1, rx: 0, ry: 0, rw: 9, rh: 9 });
  const deck = deckDeviceConditions(rows, 1);
  assert.equal(room.get('4,5').face, 3, 'the Room Zoom\'s reducer dropped the facing');
  assert.equal(deck.get('4,5').face, 3, 'the Overview\'s reducer dropped the facing');
});

test('Cmd.place carries the facing, masked, and defaults to 0', () => {
  assert.deepEqual(Cmd.place('table', 3, 4, 1, 2), { cmd: 'place', kind: 'table', x: 3, y: 4, deck: 1, facing: 2 });
  assert.equal(Cmd.place('table', 3, 4, 1).facing, 0, 'an omitted facing must be the old behaviour');
  assert.equal(Cmd.place('table', 3, 4, 1, 7).facing, 3, 'the facing is masked before it leaves');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE SURFACES — driven through the shipping controller
// ═════════════════════════════════════════════════════════════════════════════════════════════

const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), decodeRooms(decode(JSON.stringify(FIX.rooms))));
const DECK1 = 1;
const holdSlot = deckSlots(fixView, DECK1).find((e) => e.anchorName === 'hold');
const HOLD = { deck: DECK1, rx: holdSlot.rect.x, ry: holdSlot.rect.y, rw: holdSlot.rect.w, rh: holdSlot.rect.h };

/** A copy of the fixture frame with a TABLE glyph planted on one clear interior tile. */
const TABLE_TILE = (() => {
  const src = FIX.frameDeck1;
  for (let ty = HOLD.ry + 1; ty < HOLD.ry + HOLD.rh - 1; ty++) {
    for (let tx = HOLD.rx + 1; tx < HOLD.rx + HOLD.rw - 1; tx++) {
      const cell = src.cells[ty * src.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46) return { x: tx, y: ty };
    }
  }
  assert.fail('the fixture room has no clear interior tile');
  return null;
})();
const framed = (() => {
  const src = FIX.frameDeck1;
  const cells = src.cells.slice();
  const at = TABLE_TILE.y * src.w + TABLE_TILE.x;
  cells[at] = ['t'.charCodeAt(0), 0, 0, 0];        // Glyphs.ForDevice(Table)
  return { ...src, cells };
})();
const devicesMsg = (face) => ({
  type: 'devices',
  cells: [[TABLE_TILE.x, TABLE_TILE.y, DECK1, 18 /* Table */, 255, 1, 0, 1, 1, -1, face]],
});

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-ghost', 'rz-pawnlay', 'rz-pulse', 'rz-zonekey', 'rz-toast',
  'rz-nudge', 'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-cost',
  'rz-minimap', 'rz-hint', 'rz-ctx', 'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
const TAG_RE = /<(button|span)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
class RtEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; this._scanned = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v); this.childNodes = []; this._scanned = [];
    for (const m of this._html.matchAll(TAG_RE)) {
      const el = new RtEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
        else if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
      }
      el.parentNode = this;
      this._scanned.push(el);
    }
  }
  querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
  querySelectorAll(sel) {
    if (typeof sel !== 'string' || !sel.startsWith('.')) return [];
    return this._scanned.filter((e) => e.classList.contains(sel.slice(1)));
  }
  getBoundingClientRect() { return this._rect; }
  insertBefore(el) { return this.appendChild(el); }
  closest(sel) {
    let nn = this;
    while (nn && nn.nodeType === 1) {
      if (/^\[data-/.test(sel)) {
        const key = sel.replace(/^\[data-|\]$/g, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (nn.dataset && nn.dataset[key] !== undefined) return nn;
      } else if (sel.startsWith('#')) { if (nn._id === sel.slice(1)) return nn; }
      else if (nn.classList.contains(sel.replace(/^\./, ''))) return nn;
      nn = nn.parentNode;
    }
    return null;
  }
}
class RtDoc extends DomDocument {
  constructor() { super(); this.body = new RtEl(this, 'body'); }
  createElement(tag) { return new RtEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const doc = new RtDoc();
for (const id of RZ_IDS) { const e = new RtEl(doc, 'div'); e._id = id; doc.register(id, e); }
globalThis.document = doc;
const winListeners = {};
globalThis.window = { addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); }, removeEventListener() {} };
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };   // must return 0 — see build-ghost.test.js

const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const sceneRect = (() => { const vb = roomScene(HOLD).viewBox; return { left: 0, top: 0, width: vb.w, height: vb.h }; })();
const atTile = (tx, ty) => {
  const [x, y] = scenePlacement(roomScene(HOLD), HOLD).foot(tx, ty);
  return { clientX: Math.round(x), clientY: Math.round(y) };
};
const sent = [];
const api = RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(framed);
Hud.renderLedger({ type: 'ledger', matter: [['Parts', 12]] });
api.enter('hold');
const layers = doc.getElementById('rz-layers');
const ghost = doc.getElementById('rz-ghost');
const canvas = doc.getElementById('rz-canvas');
const root = doc.getElementById('roomzoom-view');
layers._rect = sceneRect;

function fire(el, type, extra) {
  const e = {
    type, target: el, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  let nn = el;
  while (nn) {
    for (const fn of ((nn.listeners && nn.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    nn = nn.parentNode;
  }
  return e;
}
function armTool(tool) {
  const btn = new RtEl(doc, 'button');
  btn.dataset.rztool = tool;
  btn.setAttribute('data-rztool', tool);
  btn.parentNode = root;
  fire(btn, 'click', {});
}
function key(k) {
  const e = {
    key: k, target: undefined, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
  };
  for (const fn of (winListeners.keydown || []).slice()) fn(e);
  return e;
}
const hover = (tx, ty) => fire(canvas, 'mousemove', { button: 0, ...atTile(tx, ty) });
const ghostFacing = () => {
  const m = /data-ghost-facing="(\d)"/.exec(ghost.innerHTML);
  return m ? Number(m[1]) : null;
};

afterEach(() => {
  api.exit();
  Hud.renderDevices(devicesMsg(0));
  api.enter('hold');
  layers._rect = sceneRect;
  fire(canvas, 'mouseleave', {});
});

test('⭐⭐ [E] CYCLES THE GHOST THROUGH FOUR FACINGS AND BACK — the owner\'s "4× rotation"', () => {
  armTool('table');
  hover(TABLE_TILE.x, TABLE_TILE.y);
  const seen = [ghostFacing()];
  const art = [ghost.innerHTML];
  for (let i = 0; i < 4; i++) {
    const e = key('e');
    assert.ok(e.defaultPrevented && e.propagationStopped,
      'the rotate key must be consumed — the deprecated console keymap is underneath');
    seen.push(ghostFacing());
    art.push(ghost.innerHTML);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 0], 'four presses did not cycle 0→1→2→3→0');
  assert.equal(art[4], art[0], 'four quarter-turns did not return the picture to where it started');
  assert.notEqual(art[1], art[0], 'a quarter-turn did not change the drawing at all');
  assert.notEqual(art[2], art[1]);
  assert.notEqual(art[3], art[2]);
});

test('the rotation is a NO-OP with nothing armed — no invisible state to be surprised by later', () => {
  key('e'); key('e');
  armTool('table');
  hover(TABLE_TILE.x, TABLE_TILE.y);
  assert.equal(ghostFacing(), 0,
    'presses made before anything was armed accumulated into a hidden facing — the player would arm '
    + 'TABLE and get it sideways for a reason nothing on screen explains');
});

test('ARMING resets the facing — the state\'s whole lifetime is something the player can see', () => {
  armTool('table');
  hover(TABLE_TILE.x, TABLE_TILE.y);
  key('e'); key('e');
  assert.equal(ghostFacing(), 2);
  armTool('table');            // disarm
  armTool('bunk');             // arm something else
  hover(TABLE_TILE.x, TABLE_TILE.y);
  assert.equal(ghostFacing(), 0, 'the facing survived a disarm — an invisible mode');
});

test('⭐⭐ THE PLACED PIECE KEEPS THE FACING THE PLAYER WAS LOOKING AT', () => {
  armTool('table');
  hover(TABLE_TILE.x, TABLE_TILE.y);
  key('e'); key('e'); key('e');
  const shown = ghostFacing();
  assert.equal(shown, 3, 'premise: three presses show facing 3');
  sent.length = 0;
  fire(canvas, 'click', { button: 0, ...atTile(TABLE_TILE.x, TABLE_TILE.y) });
  const place = sent.find((o) => o.cmd === 'place');
  assert.ok(place, 'the click lowered a place command');
  assert.equal(place.facing, shown,
    'the command carried a different facing from the one the ghost was showing — the preview and the '
    + 'placement disagree about the one thing rotation is for');
  // …and it does NOT reset between clicks: turn once, place a row the same way round.
  hover(TABLE_TILE.x, TABLE_TILE.y);
  assert.equal(ghostFacing(), 3, 'the facing reset after a placement — a row of benches would need 3N presses');
});

test('⭐⭐ standItem HANDS THE FACING TO THE BUILDER, not only to the box it puts it in', () => {
  // ⛔⛔ THE SECOND MUTATION THAT CAME BACK GREEN (J5, 2026-08-05). Dropping `facing` from
  // `standItem`'s `buildTileItem` call left `roomBox(id, s, facing)` still faced — so the piece got
  // the TURNED box's size and offsets and the UNTURNED art inside it. Every markup-inequality
  // assertion still passed, because `rb.side`/`dx`/`dy` really did change. The piece was simply
  // drawn unturned in a turned-sized hole.
  //
  // ⇒ THE CLAIM IS EQUALITY WITH THE BUILDER'S OWN OUTPUT, at the same box and the same prefix: the
  // Room Zoom must emit the drawing `buildItem(..., facing)` makes, and NOT the one facing 0 makes.
  const scene = roomScene(HOLD);
  const place = scenePlacement(scene, HOLD, scene.s * 100);
  const rb = roomBox('dining-table', ROOM_SCALE, 1);
  const want = buildItem('dining-table', { w: rb.side, h: rb.side, idPrefix: 'p', facing: 1 });
  const unturned = buildItem('dining-table', { w: rb.side, h: rb.side, idPrefix: 'p', facing: 0 });
  const got = RoomZoom.standItem('dining-table', TABLE_TILE.x, TABLE_TILE.y, place, 'p', undefined, 1);
  assert.notEqual(want, unturned, 'non-vacuity: the two facings really do draw differently');
  assert.ok(got.includes(want),
    'the Room Zoom did not emit the TURNED drawing — the facing reached `roomBox` (so the piece is '
    + 'the right size and in the right place) but not the builder, so the art inside is unturned');
  assert.ok(!got.includes(unturned));
});

test('the ROOM ZOOM draws a placed device at the facing the wire reports', () => {
  Hud.renderDevices(devicesMsg(0));
  const at0 = layers.innerHTML;
  Hud.renderDevices(devicesMsg(1));
  const at1 = layers.innerHTML;
  assert.notEqual(at1, at0,
    'the Level-2 cutaway drew the same picture for a turned device and an unturned one — the join '
    + 'from the `devices` channel to `standItem` is broken');
  assert.ok(at0.includes('data-tile="' + TABLE_TILE.x + ',' + TABLE_TILE.y + '"'),
    'non-vacuity: the planted table really is being drawn on its tile');
});

test('the OVERVIEW plate draws it turned too — one machine must not wear two pictures', () => {
  // Driven through the pure scene composer, which is what `overview-view.js` calls.
  //
  // ⛔⛔ THE STATE KEY IS `devices:`, NOT `deviceCond:`, AND THE MERGE THAT MADE IT SO AUTO-MERGED
  // CLEAN (2026-08-05, `lane/ship-drawn` × `lane/build-ghost` — TRAPS 8th shape). The plate is now a
  // SIDE ELEVATION drawing BOTH decks, so it can no longer source its fittings from `frame` (which
  // carries one deck); it reads the whole-ship `devices`/`items` channels through
  // `ship-fittings.js`'s `deckFittings`, and `overviewScene` stopped reading `deviceCond` entirely.
  // Left as it was written, this leg fed a key nothing consumes: `a` and `b` came back IDENTICAL
  // because neither carried a device at all — a red for the right reason by luck, and a leg that
  // would have gone green and VACUOUS the moment the plate drew anything else. Feed the channel the
  // composer actually reads.
  const draw = (face) => overviewScene({
    decksView: fixView, frame: framed, deck: DECK1, idPrefix: 'ov',
    devices: decodeDevices(devicesMsg(face)),
  });
  const a = draw(0);
  const b = draw(1);
  assert.notEqual(b, a,
    'the Level-1 plate ignored the facing while the Level-2 cutaway honoured it — one machine, two '
    + 'pictures, which is exactly the divergence `wear-join.test.js` shape-parity exists to catch');
  assert.ok(a.includes('data-tile="' + TABLE_TILE.x + ',' + TABLE_TILE.y + '"'),
    'non-vacuity: the plate really is drawing the planted table');
});

test('the rotate key is TAUGHT — a keyboard-only verb with no chip has only the hint line', () => {
  assert.match(ZOOM_HINT_ARMED, /ROTATE \[E\]/);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. WHAT WAS DELIBERATELY **NOT** BUILT
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('FACING IS DRAWING-ONLY ON THE CLIENT TOO — it reaches no order, no cost, no reachability', () => {
  // ⛔ The sim half of this claim is `DeviceFacingTests.TurningADeviceChangesNoMECHANIC_OnlyTheHash`.
  // This is the client half: the facing must not have leaked into any derivation that decides what
  // the player may DO. A rotation that quietly changed a price or a refusal would be a mechanic
  // nobody designed.
  const src = readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const uses = [...code.matchAll(/^.*\b_facing\b.*$/gm)].map((m) => m[0].trim());
  assert.ok(uses.length >= 5, 'non-vacuity: the stripper ate the file (' + uses.length + ' uses)');
  for (const line of uses) {
    assert.ok(!/placeRefusalText|placeIsUnaffordable|paletteCostRow|buildDragTiles|eraseTarget|demolishTarget|crewHitAtTile/.test(line),
      'the armed facing reached a decision about what the player may do: ' + line);
  }
  // ⚠️ AND THE FOOTPRINT QUESTION IS FILED, NOT ANSWERED. A 200 cm cot spans two tiles VISUALLY at
  // every facing, and the sim has no footprints at all — one device, one tile, always
  // (`PlaceDeviceCommand.Execute` writes `HasDevice` on exactly one). So a turned cot simply extends
  // the other way and can visually overhang a tile something else stands on. That is the honest
  // state; inventing sim footprints was explicitly out of scope. This assertion is the notice.
  const cot = roomBox('cot', PX_PER_CM.room, 1);
  assert.equal(cot.wCm, SPECS.cot.d, 'the turned cot really does span its depth across');
  assert.ok(SPECS.cot.w > 100, 'non-vacuity: the cot really is longer than one tile (' + SPECS.cot.w + ' cm)');
});

test('an unturned world is byte-identical to the world before rotation existed', () => {
  // The whole compatibility claim in one line: a piece with no facing, a row with no eleventh
  // element and a frame with no facing all produce the drawing that shipped yesterday.
  for (const id of FITTING_IDS) {
    assert.equal(buildItem(id, { w: 200, h: 200, idPrefix: 'x', facing: 0 }),
      buildItem(id, { w: 200, h: 200, idPrefix: 'x' }),
      `${id}: passing facing 0 is not the same as passing no facing`);
  }
  assert.equal(decodeDevices({ type: 'devices', cells: [[1, 1, 0, 18, 255, 1, 0, 1, 1, -1]] })[0].face, 0);
  assert.ok(Object.keys(ITEMS).length > 50, 'non-vacuity: the registry really was swept');
});
