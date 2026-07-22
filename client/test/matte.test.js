// Matte scrub tests — the PURE white-backdrop remover (render/matte.js). Playtest finding: two
// generated pawn walk frames shipped with an opaque white matte behind the figure (the pipeline
// keys GREEN; the image model painted white, so the key missed) and pawns "blinked white" every
// time that frame cycled in. The scrub floods from the border across transparent + near-white
// pixels and clears the near-white ones; enclosed white detail (eyes, highlights) survives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scrubMatte, gradePixels, gradeFor, GRADE, crewAccent, CREW_ACCENTS, baseKey, isCrewKey,
  paintUnderglow,
} from '../src/render/matte.js';

/** Build a w*h RGBA buffer filled with one pixel value. */
function buf(w, h, [r, g, b, a]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; }
  return d;
}
const px = (d, w, x, y) => d.slice((y * w + x) * 4, (y * w + x) * 4 + 4);
const set = (d, w, x, y, [r, g, b, a]) => { const o = (y * w + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a; };

test('an opaque white matte inset in a transparent margin is cleared (the shipped defect shape)', () => {
  // 8x8 transparent frame with an opaque white 4x4 inset and a dark 2x2 "figure" inside it.
  const w = 8, h = 8;
  const d = buf(w, h, [0, 0, 0, 0]);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) set(d, w, x, y, [255, 255, 255, 255]);
  for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) set(d, w, x, y, [40, 40, 60, 255]);
  const cleared = scrubMatte(d, w, h);
  assert.equal(cleared, 16 - 4, 'the white ring cleared, the figure kept');
  assert.deepEqual([...px(d, w, 2, 2)].slice(3), [0], 'matte corner is transparent now');
  assert.deepEqual([...px(d, w, 3, 3)], [40, 40, 60, 255], 'figure pixels untouched');
});

test('enclosed white detail inside a figure survives (no reachable path from the border)', () => {
  const w = 6, h = 6;
  const d = buf(w, h, [0, 0, 0, 0]);
  // a solid dark 4x4 figure with one white "eye" pixel in its middle
  for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) set(d, w, x, y, [30, 30, 30, 255]);
  set(d, w, 2, 2, [255, 255, 255, 255]);
  const cleared = scrubMatte(d, w, h);
  assert.equal(cleared, 0, 'nothing reachable to clear');
  assert.deepEqual([...px(d, w, 2, 2)], [255, 255, 255, 255], 'the eye survives');
});

test('a clean transparent-background sprite is a byte-for-byte no-op', () => {
  const w = 5, h = 5;
  const d = buf(w, h, [0, 0, 0, 0]);
  set(d, w, 2, 2, [200, 40, 40, 255]); // a red pixel — bright but chromatic, not matte
  const before = [...d];
  assert.equal(scrubMatte(d, w, h), 0);
  assert.deepEqual([...d], before);
});

test('light-grey mattes clear too; saturated brights never do', () => {
  const w = 4, h = 1;
  const d = new Uint8ClampedArray([
    210, 210, 215, 255,   // light grey matte — cleared
    255, 255, 255, 255,   // white matte — cleared
    255, 200, 120, 255,   // bright but saturated (skin/amber) — kept (walls the fill)
    0, 0, 0, 0,           // already transparent
  ]);
  const cleared = scrubMatte(d, w, h);
  assert.equal(cleared, 2);
  assert.equal(d[3], 0);
  assert.equal(d[7], 0);
  assert.deepEqual([...d.slice(8, 12)], [255, 200, 120, 255]);
});

test('garbage tolerance: null / zero-size / short buffers change nothing and return 0', () => {
  assert.equal(scrubMatte(null, 4, 4), 0);
  assert.equal(scrubMatte(new Uint8ClampedArray(0), 0, 0), 0);
  assert.equal(scrubMatte(new Uint8ClampedArray(8), 4, 4), 0, 'short buffer rejected');
});

// ── value-range relight ─────────────────────────────────────────────────────────────────────
// The measured defect this grade exists to fix: the shipped floor tile is luma 54..65 at a median
// of 56 — five usable levels — so a LIT interior had no value range to live in and the deck read
// as one flat mud. These tests pin the OUTCOME (where the values land), not the arithmetic.

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('the floor grade lifts the shipped deck plate into a working value range and widens it', () => {
  // The real floor sprite's shape: a near-flat band with faint plate seams beneath it.
  const d = new Uint8ClampedArray([
    46, 44, 66, 255,   // seam (the darkest plate line)
    57, 54, 80, 255,   // p50 — the tile's dominant colour, luma ~56
    66, 62, 92, 255,   // p95 highlight
  ]);
  assert.equal(gradePixels(d, 3, 1, GRADE.floor), 3);
  const L = [0, 1, 2].map((i) => luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]));
  assert.ok(L[1] > 105 && L[1] < 135, `lit floor median lands in PA's range, got ${L[1].toFixed(0)}`);
  assert.ok(L[2] - L[1] > 15, `p50→p95 spread opens up (was ~4), got ${(L[2] - L[1]).toFixed(0)}`);
  assert.ok(L[0] < L[1] - 20, 'the plate seam separates from the plate face');
  for (let i = 0; i < 3; i++) assert.equal(d[i * 4 + 3], 255, 'alpha is never touched');
});

const one = (grade, rgb) => {
  const d = new Uint8ClampedArray([...rgb, 255]);
  gradePixels(d, 1, 1, grade);
  return [d[0], d[1], d[2]];
};
const chroma = (c) => Math.max(...c) - Math.min(...c);

test('the environment grade desaturates and the crew grade saturates — chroma is reserved for people', () => {
  const src = [110, 70, 70];             // the same mid, mildly warm pixel through both grades
  const env = one(GRADE.struct, src), crew = one(GRADE.crew, src);
  assert.ok(chroma(crew) > chroma(env) * 1.5, `crew ${chroma(crew)} must out-colour env ${chroma(env)}`);
  assert.ok(luma(...crew) > luma(...src), 'crew are lifted clear of the deck they stand on');
});

test('PROPS too must lose to the crew — the class that actually paints the deck', () => {
  // struct-vs-crew alone left the loudest class untested: there are 53 sprite ENTITIES to 8 crew
  // on the slice deck, and props (terminals, beds, ladders, machines) are what a player's eye
  // competes against. Raising GRADE.prop.sat must break this, or the "chroma is for people"
  // contract is decoration.
  const src = [110, 70, 70];
  const prop = one(GRADE.prop, src), crew = one(GRADE.crew, src);
  assert.ok(chroma(crew) > chroma(prop) * 1.5,
    `crew ${chroma(crew)} must out-colour props ${chroma(prop)} by 1.5x`);
  // …and props still keep MORE colour than the shell: a live machine face is not a wall.
  assert.ok(chroma(prop) > chroma(one(GRADE.struct, src)),
    'props are allowed more chroma than the ship\'s shell');
  // A screaming source pixel (the ladder's magenta frame / the wall's conduit stripe) is the case
  // that actually mattered: both environment classes must cap it, the crew must not be capped.
  const screamer = [220, 20, 200];
  assert.ok(chroma(one(GRADE.struct, screamer)) <= GRADE.struct.chromaMax + 1,
    'the shell ceiling holds against the loudest pixel in the atlas');
  assert.ok(chroma(one(GRADE.prop, screamer)) <= GRADE.prop.chromaMax + 1,
    'the prop ceiling holds too');
  assert.ok(chroma(one(GRADE.crew, screamer)) > GRADE.prop.chromaMax * 1.5,
    'crew are NOT ceilinged — people may run to full chroma');
});

test('the chroma ceiling is surgical: it clamps only the offenders, bit-for-bit elsewhere', () => {
  const quiet = [96, 88, 84];                                   // graded chroma ≈ 7 — far under 45
  const capped = { ...GRADE.struct, chromaMax: 45 };
  const uncapped = { ...GRADE.struct }; delete uncapped.chromaMax;
  assert.deepEqual(one(capped, quiet), one(uncapped, quiet),
    'a pixel under the ceiling passes through the plain sat path unchanged');
  const loud = [200, 40, 180];
  assert.ok(chroma(one(uncapped, loud)) > 45 && Math.abs(chroma(one(capped, loud)) - 45) <= 1,
    'a pixel over the ceiling is pulled back to exactly the ceiling');
  // Hue survives the cap: the clamped pixel keeps its channel ORDER (magenta stays magenta).
  const c = one(capped, loud);
  assert.ok(c[0] > c[1] && c[2] > c[1], `hue order survives the cap, got ${c}`);
});

test('grading is pure: same pixels + same spec ⇒ same bytes, and alpha 0 is skipped entirely', () => {
  const mk = () => new Uint8ClampedArray([57, 54, 80, 255, 9, 9, 9, 0, 200, 30, 30, 128]);
  const a = mk(), b = mk();
  gradePixels(a, 3, 1, GRADE.struct);
  gradePixels(b, 3, 1, GRADE.struct);
  assert.deepEqual([...a], [...b], 'deterministic');
  assert.deepEqual([...a.slice(4, 8)], [9, 9, 9, 0], 'fully transparent pixels are left alone');
  assert.equal(gradePixels(null, 4, 4, GRADE.struct), 0);
  assert.equal(gradePixels(new Uint8ClampedArray(8), 4, 4, GRADE.struct), 0, 'short buffer rejected');
  assert.equal(gradePixels(new Uint8ClampedArray(16), 4, 1, null), 0, 'no spec ⇒ no-op');
});

test('gradeFor routes by sprite class, and animation variants grade like their base role', () => {
  assert.equal(gradeFor('floor'), GRADE.floor);
  assert.equal(gradeFor('wall'), GRADE.struct);
  assert.equal(gradeFor('terminal#broken'), GRADE.prop);
  assert.equal(gradeFor('pawn'), GRADE.crew);
  assert.equal(gradeFor('pawn_c#w2'), GRADE.crew, 'a walk frame must not grade differently');
  // The DEFAULT fails safe: an unrecognised key gets the calm shell grade, never the loud one.
  assert.equal(gradeFor('some_future_sprite'), GRADE.struct, 'unknown keys fail safe into struct');
  assert.equal(gradeFor(''), GRADE.struct);
  // …but every sprite the atlas actually ships as a prop must still be routed explicitly.
  for (const k of ['door', 'ladder', 'solar', 'growbed', 'light', 'bed', 'desk', 'plant']) {
    assert.equal(gradeFor(k), GRADE.prop, `${k} is a prop`);
  }
  assert.equal(baseKey('pawn_b#w0'), 'pawn_b');
  assert.ok(isCrewKey('pawn') && isCrewKey('pawn_b'));
  assert.ok(!isCrewKey('corpse'), 'the dead do not get a crew accent');
});

// ── crew accent ─────────────────────────────────────────────────────────────────────────────

test('crew accents are DETERMINISTIC per role and stable across a walk cycle', () => {
  assert.deepEqual(
    ['pawn', 'pawn_b', 'pawn_c'].map(crewAccent), CREW_ACCENTS,
    'the three wire variants map to the three accents in wire order',
  );
  for (const k of ['pawn_b#w0', 'pawn_b#w1', 'pawn_b#broken']) {
    assert.equal(crewAccent(k), crewAccent('pawn_b'), `${k} keeps its crew's colour`);
  }
  // An unknown future role still resolves — stably, to a real accent.
  assert.equal(crewAccent('pawn_zz'), crewAccent('pawn_zz'));
  assert.ok(CREW_ACCENTS.includes(crewAccent('pawn_zz')));
});

test('the underglow is a saturated disc under the feet that never covers the figure', () => {
  const w = 32, h = 32;
  const d = new Uint8ClampedArray(w * h * 4);
  // an opaque grey "figure": a body (x 10..21, y 8..20) on narrow legs (x 13..18, y 21..27)
  const blot = (x0, x1, y0, y1) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = (y * w + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = 120; d[o + 3] = 255;
      }
    }
  };
  blot(10, 21, 8, 20); blot(13, 18, 21, 27);
  const before = [...d];
  const touched = paintUnderglow(d, w, h, '#e8934a');
  assert.ok(touched > 20, `the disc actually paints (touched ${touched})`);
  const at = (x, y) => (y * w + x) * 4;
  assert.deepEqual([...d.slice(at(15, 20), at(15, 20) + 4)], before.slice(at(15, 20), at(15, 20) + 4),
    'a pixel inside the figure is untouched');
  const o = at(11, 26); // beside the feet, formerly empty
  assert.ok(d[o + 3] > 0, 'the margin beside the feet is now glowing');
  assert.ok(d[o] > d[o + 2], 'and it carries the accent hue (amber: red over blue)');
  assert.equal(d[at(2, 2) + 3], 0, 'the far corner stays transparent — this is a small accent');
  assert.equal(paintUnderglow(new Uint8ClampedArray(w * h * 4), w, h, '#e8934a'), 0,
    'an empty tile has no feet to stand on — no-op');
  assert.equal(paintUnderglow(null, 4, 4, '#e8934a'), 0);
});
