// THE CABINET-OBLIQUE KIT (src/render/oblique.js) — pure string builders, tested as strings.
// No DOM, no jsdom, no canvas: every assertion below is on text the module returned.
//
// The kit is the load-bearing seam for P2 (thirty fittings), P3 (the room cutaway), P4 (the plate's
// miniature interiors) and P5 (the ink figures). Four packages will build on these numbers, so the
// numbers are pinned ABSOLUTELY (exact values, not ratios) — a ratio suite cannot see a 2× scale
// error, which is a lesson this repo already paid for once.
//
// THE ANCHOR IS THE DESIGN MARKUP, not this file's arithmetic. The galley cutaway in
// `design-import/Perilune Game.dc.html` draws its floor as
//     M58 452 L875 452 L981.4 292.4 L164.4 292.4 Z
// and `room(8.6, 2.8, 2.4, 0.95)` has to reproduce it to the digit, along with both walls, both cut
// edges and every one of the eighteen floor-grid segments. If the projection is wrong, that quad is
// wrong, and no amount of internal consistency hides it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PX_PER_CM, DEPTH_RATIO, INK, PAPER, PAPER_FLAT, ATTEND, HATCH, HALO, GHOST, ROOM_WEIGHT,
  FONT, DEFAULT_ID_PREFIX,
  n, esc, poly, depth, fhDef, fhId, fhRef, box, boxFaces, room, roomFrame, haloText, ghost,
  // VR-P3 REVISION — the multi-ink label and the shared mono metric it made necessary.
  haloRuns, monoTextWidth, MONO_ADVANCE,
} from '../src/render/oblique.js';
import * as tokens from '../src/theme/paper-tokens.js';
import {
  INK as ITEM_INK, PAPER as ITEM_PAPER, ATTEND as ITEM_ATTEND, scene,
} from '../src/items/helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '../src/render/oblique.js'), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. PURITY — the module promises no DOM, no clock, no randomness, no locale API
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('oblique.js is a PURE string module — no DOM, no clock, no RNG, no locale API', () => {
  // Comments are stripped first: a purity guard that a mention in prose can redden is a guard that
  // gets weakened the first time it fires falsely (TRAPS-1).
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const banned = [
    [/\bdocument\b/, 'document'],
    [/\bwindow\b/, 'window'],
    [/\bcreateElementNS?\b/, 'createElement'],
    [/\bnew Date\b/, 'new Date'],
    [/\bDate\.now\b/, 'Date.now'],
    [/\bMath\.random\b/, 'Math.random'],
    [/\btoLocaleString\b/, 'toLocaleString'],
    [/\btoLocaleDateString\b/, 'toLocaleDateString'],
    [/\bIntl\b/, 'Intl'],
    [/\bperformance\.now\b/, 'performance.now'],
  ];
  for (const [re, name] of banned) {
    assert.ok(!re.test(code), `oblique.js reaches for ${name} — it is not a pure string module`);
  }
  // NON-VACUITY BY INCLUSION: the stripper must leave real code behind, or every scan above is free.
  assert.ok(/export function depth/.test(code) && code.length > 3000,
    'the comment stripper ate the module — the ten scans above were run against nothing');
  // and the stripper measurably removes a COMMENTED mention: the header names toLocaleString
  assert.ok(/toLocaleString/.test(SRC), 'the header no longer mentions toLocaleString — this control is dead');
});

test('the module imports nothing at all — it cannot be poisoned through a dependency', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/^\s*import\s/m.test(code), 'oblique.js grew an import — it is the shared bottom of the kit');
});

test('the three duplicated colour literals agree with paper-tokens.js and items/helpers.js', () => {
  // Three modules state black, paper and the accent as literals so that neither the item tree nor
  // the render tree needs a theme import. Duplicated literals nothing compares are how two modules
  // come to disagree about black.
  assert.equal(INK, tokens.INK.ink);
  assert.equal(PAPER, tokens.PAPER.plate);
  assert.equal(PAPER_FLAT, tokens.PAPER.inset3);
  assert.equal(ATTEND, tokens.ATTEND);
  assert.equal(ITEM_INK, tokens.INK.ink);
  assert.equal(ITEM_PAPER, tokens.PAPER.plate);
  assert.equal(ITEM_ATTEND, tokens.ATTEND);
  assert.deepEqual({ ...HATCH }, { ...tokens.HATCH });
  assert.deepEqual({ ...HALO }, { ...tokens.HALO });
  assert.deepEqual({ ...GHOST }, { ...tokens.GHOST });
});

test('the SVG type stacks are byte-identical to the ones the DOM resolves', () => {
  // An SVG label sits BESIDE DOM text in the same window. The design markup writes the SHORT stack
  // (`'Instrument Serif', serif`) because a .dc.html page has the webfont or it does not; here a
  // divergent fallback chain means the two halves of one screen disagree about what to draw the
  // moment the webfont is missing or still loading — and on this de-DE box the system serif the SVG
  // falls back to need not be the one the HTML beside it picks. Same stack, same advances.
  assert.equal(FONT.serif, tokens.TYPE.serif);
  assert.equal(FONT.mono, tokens.TYPE.mono);
  // …and TYPE is itself mirrored to --font-serif/--font-mono in styles/base.css by
  // paper-tokens.test.js's CSS_VAR walk, so this closes the chain SVG → JS token → CSS token.
  assert.equal(tokens.CSS_VAR['TYPE.serif'], '--font-serif');
  assert.equal(tokens.CSS_VAR['TYPE.mono'], '--font-mono');
  assert.ok(!/inter/i.test(FONT.serif + FONT.mono), 'ruling E9: Inter is not shipped');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. n() and depth() — the two numbers everything else is made of
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('n() rounds to 2 dp and NORMALISES −0, exactly like overview-scene.js:81', () => {
  assert.equal(n(1.005), 1.0);        // binary float, not a decimal rounder — pinned, not wished for
  assert.equal(n(79.2825), 79.28);
  assert.equal(n(106.39999999999999), 106.4);
  assert.equal(n(3), 3);
  // −0 is the one that matters: `${-0}` prints "0" but Object.is distinguishes it, and a path
  // attribute of "-0" vs "0" is a byte difference in an otherwise identical string.
  assert.equal(Object.is(n(-0), -0), false);
  assert.equal(Object.is(n(-0.001), -0), false);
  assert.equal(Object.is(n(-0.004), 0), true);
  assert.equal(n(-0.006), -0.01);     // …and a real negative still rounds negative
});

test('depth() is EXACTLY (+0.4·s·d, −0.6·s·d) at all three scales', () => {
  assert.deepEqual({ ...DEPTH_RATIO }, { x: 0.4, y: -0.6 });
  assert.deepEqual({ ...PX_PER_CM }, { plate: 1.0, room: 0.95, catalogue: 0.85 });

  // ⭐ THE MEASURED ANCHOR: the galley cutaway's 2.8 m depth at s=0.95 displaces the back edge by
  // (+106.4, −159.6) — read straight off `M58 452 L875 452 L981.4 292.4 …` (981.4−875, 292.4−452).
  assert.deepEqual(depth(280, PX_PER_CM.room), [106.4, -159.6]);

  // the catalogue's per-cm displacement: 0.4·0.85 = +0.34, 0.6·0.85 = −0.51
  assert.deepEqual(depth(100, PX_PER_CM.catalogue), [34, -51]);
  assert.deepEqual(depth(1, PX_PER_CM.catalogue), [0.34, -0.51]);
  // measured on the bench's seat slab: a 34.1 cm depth at s=0.85 → (+11.59, −17.39); the design
  // document rounds that to (11.6, −17.4) at 1 dp, and we round to 2
  assert.deepEqual(depth(34.1, PX_PER_CM.catalogue), [11.59, -17.39]);
  // the plate draws at 1:1
  assert.deepEqual(depth(50, PX_PER_CM.plate), [20, -30]);
  // zero depth is a flat elevation, and it must not carry a −0 into the path string
  assert.deepEqual(depth(0, PX_PER_CM.room), [0, 0]);
  assert.equal(Object.is(depth(0, PX_PER_CM.room)[1], -0), false);
  // a negative depth (a thing in FRONT of the plane) mirrors, it does not throw
  assert.deepEqual(depth(-100, PX_PER_CM.plate), [-40, 60]);
  // non-finite inputs read as zero rather than poisoning a whole path with "NaN"
  for (const bad of [undefined, null, NaN, Infinity, 'deep', {}]) {
    assert.deepEqual(depth(bad, 0.95), [0, 0], `depth(${String(bad)})`);
    assert.deepEqual(depth(100, bad), [0, 0], `scale ${String(bad)}`);
  }
});

test('poly() and esc() are deterministic and XML-safe', () => {
  assert.equal(poly([[1, 2], [3, 4]]), 'M1 2 L3 4 Z');
  assert.equal(poly([[1, 2], [3, 4]], false), 'M1 2 L3 4');
  assert.equal(poly([[-0, 1.005]]), 'M0 1 Z');
  assert.equal(esc('a & b <c> "d"'), 'a &amp; b &lt;c&gt; &quot;d&quot;');
  assert.equal(esc(null), '');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. box() — the three-face extrusion
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('boxFaces() reproduces the bench seat slab from the fittings sheet, to the digit', () => {
  // `Perilune Fittings.dc.html`, fitting 01 "Bench", the seat slab at s=0.85:
  //   front M54 193.8 L275 193.8 L275 198 L54 198 Z
  //   side  M275 193.8 L286.6 176.4 L286.6 180.7 L275 198 Z
  //   top   M54 193.8 L275 193.8 L286.6 176.4 L65.6 176.4 Z
  // 221 px wide / 4.2 px thick / 11.6 px of x-displacement ⇒ 260 cm × 5 cm × 34.1 cm at s=0.85.
  const f = boxFaces(54, 198, 260, 5, 34.1, 0.85);
  assert.equal(f.front, 'M54 193.75 L275 193.75 L275 198 L54 198 Z');
  assert.equal(f.side,  'M275 193.75 L286.59 176.36 L286.59 180.61 L275 198 Z');
  assert.equal(f.top,   'M54 193.75 L275 193.75 L286.59 176.36 L65.59 176.36 Z');
  // …which is the design's drawing at 2 dp instead of 1 dp: every coordinate is within half a
  // tenth of the doc's, and the doc's own numbers round to ours.
  for (const [ours, doc] of [[193.75, 193.8], [286.59, 286.6], [176.36, 176.4], [180.61, 180.7], [65.59, 65.6]]) {
    assert.ok(Math.abs(ours - doc) <= 0.1, `${ours} vs the document's ${doc}`);
  }
});

test('box() emits front, side and top IN THAT ORDER, with the design\'s fills', () => {
  const s = box(0, 100, 100, 50, 40, 1, { strokeWidth: 1.4 });
  const order = [...s.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, [PAPER, fhRef(), PAPER], 'front paper, side hatch, top paper');
  assert.equal((s.match(/<path /g) || []).length, 3);
  assert.ok(s.includes('stroke="#14120F"') && s.includes('stroke-width="1.4"'));
  // the front face stands ON the baseline and rises above it: y=100 is the floor, 50 px of height
  assert.match(s, /^<path d="M0 50 L100 50 L100 100 L0 100 Z"/);
});

test('box() honours sideFill, dash and every fill override', () => {
  assert.match(box(0, 0, 10, 10, 10, 1, { sideFill: 'flat' }).split('<path').at(2), new RegExp(`fill="${PAPER_FLAT}"`));
  assert.match(box(0, 0, 10, 10, 10, 1, { sideFill: 'none' }).split('<path').at(2), /fill="none"/);
  assert.match(box(0, 0, 10, 10, 10, 1, { sideFill: 'hatch', hatch: 'url(#rz-fh)' }), /url\(#rz-fh\)/);
  const ghosted = box(0, 0, 10, 10, 10, 1, { stroke: ATTEND, dash: '8 5', strokeWidth: 1.2 });
  assert.equal((ghosted.match(/stroke-dasharray="8 5"/g) || []).length, 3, 'the dash reaches all three faces');
  assert.equal((ghosted.match(/stroke="#7B2C22"/g) || []).length, 3);
  const over = box(0, 0, 10, 10, 10, 1, { front: '#111111', top: '#222222', opacity: 0.5 });
  assert.ok(over.includes('fill="#111111"') && over.includes('fill="#222222"'));
  assert.equal((over.match(/opacity="0.5"/g) || []).length, 3);
});

test('box() is byte-deterministic — the same input twice is the same string', () => {
  const args = [17.5, 220, 133.3, 47.25, 61.4, 0.85, { strokeWidth: 2.2, dash: '6 5' }];
  assert.equal(box(...args), box(...args));
  // and a zero-depth box degenerates without emitting −0 anywhere
  const flat = box(0, 0, 40, 40, 0, 1);
  assert.ok(!flat.includes('-0 ') && !flat.includes('"-0'), `a −0 leaked into ${flat}`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. room() — ⭐ the measured anchor: the galley cutaway, reproduced
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐ room(8.6, 2.8, 2.4, 0.95) reproduces the galley plate\'s own geometry', () => {
  const svg = room(8.6, 2.8, 2.4, PX_PER_CM.room);
  // floor quad — the exact string in `Perilune Game.dc.html`
  assert.ok(svg.includes('d="M58 452 L875 452 L981.4 292.4 L164.4 292.4 Z"'), 'the floor quad moved');
  // back wall, 2.4 m tall
  assert.ok(svg.includes('d="M164.4 292.4 L981.4 292.4 L981.4 64.4 L164.4 64.4 Z"'), 'the back wall moved');
  // hatched left wall
  assert.ok(svg.includes('d="M58 452 L164.4 292.4 L164.4 64.4 L58 224 Z"'), 'the left wall moved');
  // the solid front floor edge
  assert.ok(svg.includes('d="M58 452 L875 452"'), 'the front floor edge moved');
  // and the two DASHED cut edges — the right wall and the ceiling, cut away rather than absent
  assert.ok(svg.includes('d="M875 452 L875 224"'), 'the vertical cut edge moved');
  assert.ok(svg.includes('d="M875 224 L981.4 64.4"'), 'the diagonal cut edge moved');
  assert.equal((svg.match(/stroke-dasharray="7 5"/g) || []).length, 2, 'exactly two cut edges are dashed');
  // the left wall is the ONLY hatched face
  assert.equal((svg.match(new RegExp(`fill="${fhRef().replace(/[()#]/g, '\\$&')}"`, 'g')) || []).length, 1);
});

test('the floor grid is 60 cm across the width, five bands deep, at 0.5/0.2 like the design', () => {
  const svg = room(8.6, 2.8, 2.4, PX_PER_CM.room);
  assert.match(svg, /<g fill="none" stroke="#14120F" stroke-width="0.5" opacity="0.2"><path d="([^"]+)"\/><\/g>/);
  const d = svg.match(/opacity="0.2"><path d="([^"]+)"/)[1];
  const segs = d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean);
  // 14 lines across the 8.6 m width at 60 cm (0.6·15 = 9.0 m overruns) + 4 depth bands from 5 divs
  assert.equal(segs.length, 18, `expected 18 grid segments, got ${segs.length}`);
  assert.equal(segs[0], 'M115 452 L221.4 292.4');    // the design's first depth line, exactly
  assert.equal(segs[13], 'M856 452 L962.4 292.4');   // …and its last
  // the cross lines run at 1/5 of the depth each; the design rounds 79.28→79.3, 420.08→420.1
  assert.equal(segs[14], 'M79.28 420.08 L896.28 420.08');
  assert.equal(segs[17], 'M143.12 324.32 L960.12 324.32');
  // `grid:false` removes the whole group and nothing else
  const bare = room(8.6, 2.8, 2.4, PX_PER_CM.room, { grid: false });
  assert.ok(!bare.includes('opacity="0.2"'));
  assert.ok(bare.includes('d="M58 452 L875 452 L981.4 292.4 L164.4 292.4 Z"'));
});

test('roomFrame().project() is the ONE placement door P3 and P4 must go through', () => {
  const f = roomFrame(8.6, 2.8, 2.4, PX_PER_CM.room);
  assert.deepEqual(f.project(0, 0, 0), [58, 452]);          // front-left, on the floor
  assert.deepEqual(f.project(860, 0, 0), [875, 452]);        // front-right
  assert.deepEqual(f.project(860, 280, 0), [981.4, 292.4]);  // back-right
  assert.deepEqual(f.project(0, 280, 240), [164.4, 64.4]);   // back-left, at the ceiling
  assert.deepEqual(f.project(430, 140, 120), [519.7, 258.2]); // dead centre of the volume
  assert.deepEqual(f.corners.frontLeft, [58, 452]);
  assert.deepEqual(f.corners.backRightTop, [981.4, 64.4]);
  assert.equal(f.wCm, 860);
  assert.equal(f.dCm, 280);
  assert.equal(f.hCm, 240);
  // a garbage coordinate degrades to the origin rather than writing NaN into a path
  assert.deepEqual(f.project(NaN, undefined, 'up'), [58, 452]);
  // the frame is frozen — nobody mutates the room's coordinate system from a draw call
  assert.ok(Object.isFrozen(f) && Object.isFrozen(f.corners));
});

test('room() honours its origin, scale and paint overrides, and is byte-deterministic', () => {
  const a = room(4, 3, 2.5, PX_PER_CM.plate, { x: 10, y: 300, hatch: 'url(#p-fh)', ink: ATTEND });
  const b = room(4, 3, 2.5, PX_PER_CM.plate, { x: 10, y: 300, hatch: 'url(#p-fh)', ink: ATTEND });
  assert.equal(a, b);
  assert.ok(a.includes('M10 300 L410 300'), 'a 4 m room at 1 px/cm is 400 px wide from x=10');
  assert.ok(a.includes('url(#p-fh)') && !a.includes(fhRef()));
  assert.equal((a.match(/stroke="#7B2C22"/g) || []).length, 6,
    'ink override must reach all five stroked paths AND the floor-grid group');
  // a degenerate room does not throw and emits no grid
  assert.doesNotThrow(() => room(0, 0, 0, 0.95));
  assert.ok(!room(0, 0, 0, 0.95).includes('opacity="0.2"'));
  // …and the drawing weights are the measured ones
  assert.deepEqual({ ...ROOM_WEIGHT },
    { wall: 2.2, floor: 1.4, edge: 2.2, cut: 1.1, cutDash: '7 5', grid: 0.5, gridOpacity: 0.2 });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. fhDef() — ONE shared def per surface root, id-namespaced
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('fhDef() is the design\'s pattern verbatim and NAMESPACES its id', () => {
  assert.equal(fhDef(),
    '<pattern id="ob-fh" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
    + '<rect width="7" height="7" fill="#EBE4D1"/>'
    + '<path d="M0 0 L0 7" stroke="#14120F" stroke-width="0.7" opacity="0.28"/>'
    + '</pattern>');
  // two surfaces in one document must not collide — the id-collision rule overview-scene pins
  assert.equal(fhId('rz'), 'rz-fh');
  assert.equal(fhId('ov'), 'ov-fh');
  assert.equal(fhRef('rz'), 'url(#rz-fh)');
  assert.ok(fhDef('rz').startsWith('<pattern id="rz-fh"'));
  assert.notEqual(fhId('rz'), fhId('ov'));
  // the prefix is escaped, so a hostile id cannot close the attribute
  assert.ok(!fhDef('a"b').includes('id="a"b"'));
});

test('⭐ NO input to fhId() yields the design\'s BARE `fh` — the default is namespaced too', () => {
  // The design documents write `<pattern id="fh">` because each is one hand-authored page with one
  // hatch. This kit feeds four surfaces that compose into ONE document, so a bare `fh` is a
  // collision waiting for the second caller — and every input below used to produce it.
  for (const blank of [undefined, null, '', '   ', '\t\n ', 42, {}, [], NaN]) {
    assert.equal(fhId(blank), `${DEFAULT_ID_PREFIX}-fh`, `fhId(${String(blank)}) fell back wrong`);
    assert.notEqual(fhId(blank), 'fh', `fhId(${String(blank)}) produced the UNNAMESPACED id`);
  }
  // a prefix is trimmed, not taken literally: '  rz ' and 'rz' are one namespace, not two
  assert.equal(fhId('  rz '), 'rz-fh');
  assert.equal(fhId('\trz\n'), fhId('rz'));
});

test('⭐ THE DEFAULT PATH IS SELF-CONSISTENT — box()/room() reference the id fhDef() defines', () => {
  // ⛔ THE BUG THIS PINS, WHICH SHIPPED IN VR-A AND WAS CAUGHT BY REVIEW: `box()` and `room()`
  // defaulted their hatch to `url(#fh)` while `fhDef(prefix)` emitted `prefix-fh`. A caller taking
  // ALL the defaults — which is what every early P2 fitting does — emitted a side face pointing at
  // an id nothing in the document defined. SVG renders an unresolvable paint as NOTHING: no error,
  // no console warning, just a side face that quietly stops being hatched. Only the two halves
  // agreeing makes the default path safe, so assert the JOIN, never each half's spelling.
  const defId = fhDef().match(/id="([^"]+)"/)[1];

  const boxRef = box(0, 0, 10, 10, 10, 1).match(/fill="url\(#([^)]+)\)"/)[1];
  assert.equal(boxRef, defId, 'default box() hatches with an id default fhDef() never defines');

  const roomRef = room(4, 3, 2.5, 1).match(/fill="url\(#([^)]+)\)"/)[1];
  assert.equal(roomRef, defId, 'default room() hatches with an id default fhDef() never defines');

  // NON-VACUITY: the join above would also hold if both halves were empty or malformed.
  assert.equal(defId, `${DEFAULT_ID_PREFIX}-fh`);
  assert.ok(defId.length > 3 && !defId.includes('undefined') && !defId.includes('NaN'));

  // and two DIFFERENT explicit prefixes never collide, in any of the three emitters
  const a = 'rz'; const b = 'ov';
  assert.notEqual(fhId(a), fhId(b));
  assert.ok(fhDef(a).includes(`id="${fhId(a)}"`) && fhDef(b).includes(`id="${fhId(b)}"`));
  assert.ok(box(0, 0, 10, 10, 10, 1, { hatch: fhRef(a) }).includes(`url(#${fhId(a)})`));
  assert.ok(!box(0, 0, 10, 10, 10, 1, { hatch: fhRef(a) }).includes(`url(#${fhId(b)})`));
  assert.ok(room(4, 3, 2.5, 1, { hatch: fhRef(b) }).includes(`url(#${fhId(b)})`));
  assert.ok(!room(4, 3, 2.5, 1, { hatch: fhRef(b) }).includes(`url(#${fhId(a)})`));
  // …and neither explicit prefix silently lands back on the default namespace
  assert.notEqual(fhId(a), defId);
  assert.notEqual(fhId(b), defId);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. haloText()
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('haloText() paints the stroke UNDER the fill, in paper, at the measured 3.4', () => {
  const t = haloText("Osei's place is still laid", 672.8, 437.9, { italic: true, size: 15 });
  // the design's own leader label: serif, italic, 15px, oxblood on a 3.4px paper halo
  assert.ok(t.includes(`font-family="${FONT.serif}"`));
  assert.ok(t.includes('font-style="italic"'));
  assert.ok(t.includes('font-size="15"'));
  assert.ok(t.includes(`fill="${ATTEND}"`));
  assert.ok(t.includes(`stroke="${PAPER}"`));
  assert.ok(t.includes('stroke-width="3.4"'));
  // ⚠️ THE LEADING SPACE IS LOAD-BEARING. A bare `includes('paint-order="stroke"')` also matches
  // `data-paint-order="stroke"`, which renders nothing — that exact mutation SURVIVED this guard
  // when it was written without the space. An attribute test has to match the attribute BOUNDARY.
  assert.match(t, /\spaint-order="stroke"/, 'without paint-order the halo is an OUTLINE, not a knockout');
  assert.ok(!/data-paint-order/.test(t), 'paint-order must be the real attribute, not a data- shadow');
  assert.ok(t.includes('>Osei&#039;s place is still laid</text>') || t.includes(">Osei's place is still laid</text>"));
  // mono is the other face, and nothing may name Inter (ruling E9)
  assert.ok(haloText('SEATS 5 OF 3 ABOARD', 9, 42, { font: 'mono' }).includes(FONT.mono));
  assert.ok(!/inter/i.test(haloText('x', 0, 0, {}) + haloText('x', 0, 0, { font: 'mono' })));
  // the label is XML-escaped — a crew name with an ampersand must not break the document
  assert.ok(haloText('Stores & Logistics', 0, 0).includes('Stores &amp; Logistics'));
  assert.ok(!haloText('<script>', 0, 0).includes('<script>'));
  // deterministic
  assert.equal(haloText('A', 1, 2, { size: 9 }), haloText('A', 1, 2, { size: 9 }));
});

/**
 * ⭐⭐ `haloRuns()` — ONE label, ONE baseline, ONE halo, and the accent spent on ONE CLAUSE.
 *
 * ⛔ IT EXISTS BECAUSE OF A MEASURED DEFECT: the Room Zoom's stat line set `fill` on the whole
 * `<text>` when a compartment was airless, so `24.1 M² · 5 OF 9 FITTINGS BUILT · 2 OF 3 ABOARD` all
 * printed in oxblood beside the `NO AIR` that had earned it — while the code's own comments said only
 * the trailing clause took the accent. Charter §1 allows ONE accent and spends it on ATTENTION; a
 * whole line in the attention colour says the floor area is an emergency.
 *
 * The tag is `haloText`'s, character for character — same halo, same face, same paint-order — because
 * both now open through one builder. That equality is the assertion that keeps them from drifting.
 */
test('haloRuns() emits ONE haloed text whose runs can carry their own ink', () => {
  const opts = { size: 9, font: 'mono', tracking: 1.6, fill: '#6B6252', stroke: PAPER, anchor: 'start' };
  const plain = haloRuns([{ t: 'A · B' }], 9, 42, opts);
  // 1 — THE TAG IS `haloText`'S. A second spelling of the halo is how two labels on one surface come
  // to wear two different knockouts.
  assert.equal(plain, haloText('A · B', 9, 42, opts),
    'a single unfilled run must be byte-identical to haloText — they open through one builder');

  // 2 — ONLY THE FILLED RUN CARRIES THE ACCENT, and the base ink stays on the <text>.
  const mixed = haloRuns([{ t: '24.1 M² · ' }, { t: 'NO AIR', fill: ATTEND }], 9, 42, opts);
  assert.equal((mixed.match(/<tspan/g) || []).length, 1, 'exactly one run needed a tspan');
  assert.ok(mixed.includes(`<tspan fill="${ATTEND}">NO AIR</tspan>`), 'the accented run is not tinted');
  const open = mixed.slice(0, mixed.indexOf('>') + 1);
  assert.ok(open.includes('fill="#6B6252"'), 'the base ink left the <text> element');
  assert.ok(!open.includes(ATTEND), 'the whole line is tinted with the accent — the exact defect');
  assert.ok(!mixed.slice(0, mixed.indexOf('<tspan')).includes(ATTEND),
    'the clauses BEFORE the accented one are inside the accented ink');

  // 3 — RUNS ARE DATA, NEVER MARKUP. `haloRuns` takes text and escapes it, exactly as haloText does;
  // a builder that let a caller pass markup through would be an injection seam on every label.
  const evil = haloRuns([{ t: '<script>x</script>', fill: ATTEND }], 0, 0, {});
  assert.ok(!evil.includes('<script>'), 'a run is interpolated raw — this is a markup injection seam');
  assert.ok(evil.includes('&lt;script&gt;'), 'the run was dropped rather than escaped');
  // 4 — degenerate inputs draw an empty label rather than throwing or emitting `undefined`.
  for (const bad of [null, undefined, [], [null], [{}]]) {
    const s = haloRuns(bad, 0, 0, {});
    assert.ok(s.startsWith('<text') && s.endsWith('</text>') && !/undefined|null|NaN/.test(s),
      `haloRuns(${JSON.stringify(bad)}) emitted ${JSON.stringify(s)}`);
  }
  // 5 — deterministic
  assert.equal(haloRuns([{ t: 'A' }], 1, 2, opts), haloRuns([{ t: 'A' }], 1, 2, opts));
});

/**
 * `monoTextWidth()` — the ONE estimate of how wide a mono label is going to be, and the reason it is
 * shared: the Room Zoom CLAMPS door labels into its viewBox with it and SCALES its stat line to fit
 * with it, and the count badge FITS its digits with the same advance. Two estimates would let a label
 * be clamped to a width nothing else agreed with.
 *
 * A pure string module cannot measure a font, so this is an estimate and is named as one. What it
 * must be is MONOTONIC and PROPORTIONAL — the two properties every caller relies on.
 */
test('monoTextWidth() is proportional in length, size and tracking, and zero for nothing', () => {
  assert.equal(monoTextWidth('', 9, 1.6), 0);
  assert.equal(monoTextWidth(null, 9, 1.6), 0);
  // proportional in LENGTH
  assert.ok(Math.abs(monoTextWidth('AAAA', 9, 0) - 4 * monoTextWidth('A', 9, 0)) < 1e-9);
  // proportional in SIZE (with tracking held at 0, where size is the only term)
  assert.ok(Math.abs(monoTextWidth('ABC', 18, 0) - 2 * monoTextWidth('ABC', 9, 0)) < 1e-9);
  // TRACKING widens it — SVG adds one advance after every glyph, including the last
  assert.ok(monoTextWidth('ABC', 9, 1.6) > monoTextWidth('ABC', 9, 0));
  assert.equal(monoTextWidth('ABC', 9, 1.6), n(3 * (9 * MONO_ADVANCE + 1.6)));
  // …and it is the advance the count badge already fits its digits with (`room-model.js ADVANCE`).
  assert.equal(MONO_ADVANCE, 0.62);
  // non-finite inputs read as 0 rather than poisoning a clamp with NaN
  assert.equal(monoTextWidth('ABC', NaN, NaN), 0);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. ghost() — the two-pass ink figure (ruling E10)
// ═════════════════════════════════════════════════════════════════════════════════════════════

const FIGURE = [
  { d: 'M-13 0 L-2 0 M2 0 L13 0', sw: 1.4 },
  { d: 'M-8 -2 L-7 -66 M7 -2 L6 -66', sw: 1.2 },
  { ellipse: [0, -132, 11, 12.5], sw: 1.3 },
  { rect: [18, -96, 12, 13, 2], sw: 1.4, stroke: ATTEND },
];

test('⭐ ghost() emits the KNOCKOUT pass FIRST and the ink pass second — order is the whole point', () => {
  const g = ghost(FIGURE);
  const knockEnd = g.indexOf('</g>');
  assert.ok(knockEnd > 0, 'the knockout pass must be one <g>, so a surface can hide or reuse it wholesale');
  const halo = g.slice(0, knockEnd);
  const ink = g.slice(knockEnd);
  // every element appears in BOTH passes, from ONE source list
  assert.equal((halo.match(/<(path|ellipse|rect)/g) || []).length, FIGURE.length);
  assert.equal((ink.match(/<(path|ellipse|rect)/g) || []).length, FIGURE.length);
  // the halo is paper, filled AND stroked, so it CARVES rather than outlines
  assert.equal((halo.match(new RegExp(`fill="${PAPER}"`, 'g')) || []).length, FIGURE.length);
  assert.equal((halo.match(new RegExp(`stroke="${PAPER}"`, 'g')) || []).length, FIGURE.length);
  assert.ok(!halo.includes(INK), 'no ink may appear in the knockout pass');
  // the ink pass is unfilled and keeps each element's OWN colour — the accent survives the round trip
  assert.equal((ink.match(/fill="none"/g) || []).length, FIGURE.length);
  assert.ok(ink.includes(`stroke="${ATTEND}"`), 'the accented element lost its colour in the ink pass');
  assert.equal((ink.match(new RegExp(`stroke="${INK}"`, 'g')) || []).length, FIGURE.length - 1);
});

test('every knockout stroke is WIDER than its ink stroke, by the measured +3.0', () => {
  const g = ghost(FIGURE);
  const knockEnd = g.indexOf('</g>');
  const widths = (s) => [...s.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  const halo = widths(g.slice(0, knockEnd));
  const ink = widths(g.slice(knockEnd));
  assert.deepEqual(ink, [1.4, 1.2, 1.3, 1.4]);
  assert.deepEqual(halo, [4.4, 4.2, 4.3, 4.4]);   // the design's own pawn, to the digit
  for (let i = 0; i < ink.length; i++) {
    assert.ok(halo[i] > ink[i], `halo ${halo[i]} does not cover ink ${ink[i]} — the knockout is invisible`);
    assert.equal(halo[i], n(ink[i] + GHOST.widen));
  }
  // a caller may say otherwise, and the ordering must still hold
  const wide = ghost(FIGURE, { widen: 6 });
  assert.deepEqual(widths(wide.slice(0, wide.indexOf('</g>'))), [7.4, 7.2, 7.3, 7.4]);
});

test('ghost() renders all three element kinds and degrades on junk without throwing', () => {
  const g = ghost(FIGURE);
  assert.ok(g.includes('<ellipse') && g.includes('<rect') && g.includes('<path'));
  assert.ok(g.includes('rx="11"') && g.includes('ry="12.5"'));
  assert.ok(g.includes('width="12"') && g.includes('height="13"') && g.includes('rx="2"'));
  // an ellipse with no ry is a circle, not a NaN
  assert.ok(ghost([{ ellipse: [0, 0, 5], sw: 1 }]).includes('ry="5"'));
  for (const junk of [undefined, null, [], [null, {}, 5, 'x'], 'nope', 42]) {
    let out;
    assert.doesNotThrow(() => { out = ghost(junk); });
    assert.equal(out, '', `ghost(${JSON.stringify(junk)}) should be empty, got ${out}`);
  }
  // deterministic
  assert.equal(ghost(FIGURE), ghost(FIGURE));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 8. THE items/helpers.js SEAM — the same halo idiom, on the side P2's thirty builders use
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `scene().text()` gained `stroke` / `strokeWidth` / `paintOrder` at VR-A. It lives here rather than
// in the item-model suite because it is the SAME charter §1 rule `haloText()` implements, and the
// two had better not drift: one is for a surface composing an SVG document, the other for an item
// builder composing a tile fragment.

const bodyOf = (svg) => svg.replace(/^[\s\S]*?scale\([^)]*\)">/, '').replace(/<\/g><\/g>$/, '');

test('scene().text() is BYTE-IDENTICAL to its pre-VR-A output when no halo is asked for', () => {
  // The attributes are APPENDED, never interleaved, so every existing item golden holds. This is the
  // assertion that says so out loud: a rewrite that reorders the attribute list would pass every
  // "does it have a fill" test and silently move every committed item string.
  const s = scene('t').text('7', { x: 1, y: 2, size: 9, fill: '#abcdef' });
  assert.equal(
    bodyOf(s.render(100, 100)),
    '<text x="1" y="2" text-anchor="middle" dominant-baseline="central"'
    + ' font-family="\'Space Mono\', ui-monospace, monospace" font-size="9" fill="#abcdef">7</text>',
  );
  assert.ok(!bodyOf(s.render(100, 100)).includes('paint-order'), 'an un-haloed label must not carry the attribute');
});

test('scene().text() wears the halo idiom when asked, and defaults the width to the measured 3.4', () => {
  const halo = bodyOf(scene('t').text('X', {
    x: 0, y: 0, size: 10, fill: ITEM_ATTEND, stroke: ITEM_PAPER, paintOrder: 'stroke',
  }).render(100, 100));
  assert.match(halo, /\sstroke="#EBE4D1"/);
  assert.match(halo, /\sstroke-width="3.4"/, 'the halo width must default to the design\'s 3.4');
  assert.match(halo, /\spaint-order="stroke"/, 'without paint-order the halo is an OUTLINE, not a knockout');
  assert.ok(!/data-paint-order/.test(halo), 'it must be the real attribute, not a data- shadow');
  // an explicit width wins, and 0 is a real width rather than a falsy fallback to 3.4
  assert.match(bodyOf(scene('t').text('X', { x: 0, y: 0, stroke: ITEM_PAPER, strokeWidth: 1.1 }).render(100, 100)),
    /\sstroke-width="1.1"/);
  assert.match(bodyOf(scene('t').text('X', { x: 0, y: 0, stroke: ITEM_PAPER, strokeWidth: 0 }).render(100, 100)),
    /\sstroke-width="0"/);
  // stroke-width is only emitted with a stroke — a width alone would be an inert attribute
  assert.ok(!bodyOf(scene('t').text('X', { x: 0, y: 0, strokeWidth: 3.4 }).render(100, 100)).includes('stroke-width'));
  // and the ink figure's colour agreement holds at this seam too
  assert.equal(ITEM_INK, INK);
});
