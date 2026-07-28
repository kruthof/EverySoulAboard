// The 8 RESOURCE builders — the GROUND STACKS of the warm item set (docs/design/perilune-item-set
// .dc.html, section "Resources & loose items", re-imported 2026-07-27 as the 8 NEW pieces). Each is a
// pure `(opts) -> string` SVG-`<g>`-fragment builder in the same centred mock-px space as
// objects.js / structures.js / fixtures.js; see helpers.js for the coordinate model.
//
// WHY THESE ARE A FILE OF THEIR OWN and not eight more rows in objects.js: an OBJECT is a thing a
// player PLACES and a device the sim OWNS. A resource is loose matter LYING on a floor tile, keyed by
// `Glyphs.ForItem` rather than `Glyphs.ForDevice`, and it is the only class in the registry whose
// count is real information (the `items` wire channel carries it; `room-model.js` draws it).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THREE TRANSLATIONS THE MOCK FORCED, each decided here rather than discovered later.
//
// 1. `conic-gradient` → REAL TEETH. The mock draws both PARTS cogs as a circle filled with an
//    eight-stop `conic-gradient`, i.e. a pie of alternating light/dark sectors that only READS as a
//    cog because it is 28 px on a dark stage. SVG HAS NO CONIC GRADIENT. Faking one with eight
//    filled sectors would keep the mock's bytes and lose the piece: at 32 px a pie of grey wedges is
//    a grey disc. So the cog is drawn as GEOMETRY — `gearPath` walks `teeth` tooth quads between an
//    inner and an outer radius and closes them into one path — plus a hub hole. That is a departure
//    from the mock's literal fill and it is the point: the SILHOUETTE is what survives the downscale,
//    and a toothed rim is the only silhouette in this set that says "machine parts".
//
// 2. CSS `animation` → DROPPED, not ported to SMIL. The mock pulses CONTROLLER MODULE's status LED
//    (`@keyframes pulse`) and flickers REACTOR's core (`@keyframes eflick`). A builder is
//    `(opts) -> string` with "no DOM, no clock, no randomness — same input ⇒ byte-identical output"
//    (helpers.js:1-7). A SMIL `<animate>` element would not break THAT — the string is still a pure
//    function of `opts` — but it would make the RENDERED PIXELS a function of wall-clock time, which
//    (a) is invisible to every assertion in this repo (they all read the string) and (b) makes any
//    screenshot comparison flaky for a reason no test could name. The 60 shipped pieces already made
//    this choice silently: `objects.js`'s `reactor` and `sensorArray` carry no `<animate>` either,
//    though the mock animates both. Here it is made out loud. A lit state is expressed the way the
//    rest of the set expresses it — a static `s.glow` behind the lit element, dimmable via
//    `opts.state`.
//
// 3. `box-shadow` → `s.glow` / `s.border`, the set's own idiom, never a new one. The mock uses
//    box-shadow for three different things and they translate three different ways:
//      • `inset 0 0 0 Npx <c>`  → `s.border(...)`  (an inner ring)
//      • `0 0 Npx Mpx rgba(...)` → `s.glow(...)`   (a soft coloured bloom, drawn BEFORE the lit part)
//      • `0 2px 4px rgba(0,0,0,.45)` → a soft dark `s.glow` ellipse UNDER the piece: the contact
//        shadow. The 60 furniture pieces drop this one; the resources keep it, because a pile has no
//        outline of its own to sit on and without a shadow it floats over the floor tint.
//
// NO SCATTER, DERIVED OR OTHERWISE. Every lump position below is AUTHORED from the mock, so the
// "a pile that reads as scattered must derive its scatter from `opts`, never from RNG" constraint
// (HANDOVER, the `items` channel block) is met by construction: there is no scatter term at all and
// therefore nothing that could reach for `Math.random`.
//
// LEGIBILITY IS BY SILHOUETTE, NOT HUE. Four of these — REGOLITH, SCRAP, PARTS, SEALS — are the same
// grey-brown industrial granulate and hue cannot separate them at 32 px. The shapes deliberately do:
//   REGOLITH  a wide LOW MOUND of rounded lumps        (nothing straight in it)
//   POTATO    three fat OVALS with eyes, warm tan      (organic, the only warm-only piece)
//   SCRAP     crossed straight BARS at angles          (all straight edges, a jagged star)
//   PARTS     TOOTHED DISCS + a spanner                (the only radial teeth)
//   CTRL MOD  a RECTANGLE with comb-like pin rows      (the only orthogonal board)
//   SEALS     ANNULI — thick rings round a dark bore (the only ring-with-a-hole silhouette)
//   ICE       hard-edged faceted BLOCKS, cold blue     (the only cold hue)
//   CORPSE    one tall vertical CAPSULE                (the only single tall body)
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { item, roundedRectPath, r3 } from './helpers.js';

/**
 * A closed cog outline: `teeth` rectangular teeth swept between `rIn` and `rOut` about (cx,cy).
 * PURE and deterministic — every coordinate goes through `r3`, which rounds to 3 dp and absorbs the
 * last-place differences an engine's `Math.cos`/`Math.sin` are permitted to have.
 *
 * Straight segments, not arcs: at the scale this is drawn (an r≈14 cog inside a 128-unit design box
 * shown at ~32 px) an arc between two teeth is under a pixel of chord error, and a polyline keeps the
 * path short. The 0.16/0.34/0.5 fractions are the tooth profile — tip narrower than root, so the
 * teeth read as teeth rather than as a star.
 */
export function gearPath(cx, cy, rOut, rIn, teeth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    for (const [rad, frac] of [[rIn, 0], [rOut, 0.16], [rOut, 0.34], [rIn, 0.5]]) {
      const t = a + step * frac;
      pts.push(r3(cx + rad * Math.cos(t)) + ',' + r3(cy + rad * Math.sin(t)));
    }
  }
  return 'M' + pts.join('L') + 'Z';
}

/**
 * The contact shadow every loose pile sits in (the mock's `0 2px 4px rgba(0,0,0,.45)`).
 *
 * NOT `s.glow`, and the difference is visible in a browser rather than in a string. `glow` holds its
 * centre colour flat to 0.6 of the radius before fading, which is right for a light bloom and wrong
 * for a shadow: at tile size it draws a hard grey disc with a smear round it, and the pile looks
 * stuck to a sticker rather than resting on the floor. A three-stop falloff reads as contact.
 */
function ground(s, cx, cy, rx, ry) {
  const g = s.rad([
    [0, 'rgba(0,0,0,.42)'],
    [0.5, 'rgba(0,0,0,.2)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  s.ellipse({ cx, cy, rx, ry, fill: g });
}

// 61 REGOLITH (',') — a wide low mound of rounded spoil lumps. Nothing in it is straight.
export const regolith = (opts = {}) =>
  item('regolith', opts, (s) => {
    ground(s, 0, 24, 42, 12);
    const lump = (x, y, w, h, top, bot, corners) => {
      s.path(roundedRectPath(x - w / 2, y - h / 2, w, h, corners), {
        fill: s.lin([
          ['0', top],
          ['1', bot],
        ]),
      });
    };
    // back row first (drawn lowest), then the crown — the mock's own paint order.
    lump(-20, -6, 14, 11, '#7d7566', '#5a5346', { tl: 6, tr: 4, br: 6, bl: 4 });
    lump(18, -8, 16, 13, '#8a8272', '#635c4f', { tl: 5, tr: 7, br: 4, bl: 6 });
    lump(-16, 16, 22, 16, '#8a8272', '#635c4f', { tl: 6, tr: 8, br: 4, bl: 7 });
    lump(14, 18, 26, 18, '#7d7566', '#5a5346', { tl: 8, tr: 5, br: 8, bl: 5 });
    lump(-2, 2, 30, 22, '#968d7c', '#6b6455', { tl: 9, tr: 6, br: 9, bl: 7 });
  });

// 62 POTATO ('f') — three fat tubers with eyes. The only piece that is warm tan all through.
export const potato = (opts = {}) =>
  item('potato', opts, (s) => {
    ground(s, 0, 22, 38, 11);
    const tuber = (cx, cy, rx, ry, a, b) => {
      s.ellipse({
        cx,
        cy,
        rx,
        ry,
        fill: s.rad(
          [
            [0, a],
            [1, b],
          ],
          { cx: 0.38, cy: 0.32 },
        ),
      });
    };
    tuber(-16, 14, 15, 11, '#d2a86a', '#a97d45');
    tuber(16, 16, 14, 10.5, '#c99f61', '#9d723d');
    tuber(0, -4, 17, 12.5, '#dbb377', '#ab7f46');
    // eyes — the detail that makes a tan oval a potato rather than a bread roll
    s.circle({ cx: -6, cy: -8, r: 2, fill: 'rgba(90,60,30,.55)' });
    s.circle({ cx: 8, cy: 0, r: 1.5, fill: 'rgba(90,60,30,.55)' });
    s.circle({ cx: -18, cy: 12, r: 1.5, fill: 'rgba(90,60,30,.5)' });
  });

// 63 SCRAP ('s') — torn plate offcuts crossed at angles, plus a bent bracket and a washer.
// All straight edges: the jagged silhouette is the whole separation from REGOLITH.
export const scrap = (opts = {}) =>
  item('scrap', opts, (s) => {
    ground(s, 0, 22, 40, 11);
    const bar = (cx, cy, w, h, deg, top, bot) => {
      s.raw(
        '<g transform="translate(' + r3(cx) + ' ' + r3(cy) + ') rotate(' + r3(deg) + ')">' +
          '<rect x="' + r3(-w / 2) + '" y="' + r3(-h / 2) + '" width="' + r3(w) + '" height="' +
          r3(h) + '" rx="2" fill="' +
          s.lin([
            ['0', top],
            ['1', bot],
          ]) +
          '"/></g>',
      );
    };
    bar(-13, 15, 44, 14, -14, '#9fadb8', '#5f6e79');
    bar(13, 9, 38, 12, 22, '#8fa2ad', '#4f5c66');
    bar(-4, -6, 34, 11, -42, '#b8c6cf', '#6b7a85');
    // a folded bracket and a washer — two more straight-edged reads at the top of the heap
    s.rect({
      x: 6,
      y: -21,
      w: 20,
      h: 18,
      rx: 3,
      fill: s.lin([
        ['0', '#7d8b96'],
        ['1', '#4a5560'],
      ]),
    });
    s.border({ x: 6, y: -21, w: 20, h: 18, rx: 3, color: '#38424d', width: 2 });
    s.circle({ cx: -20, cy: -10, r: 7, fill: '#5f6e79' });
    s.circle({ cx: -20, cy: -10, r: 5.5, fill: 'none', stroke: '#38424d', sw: 3 });
  });

// 64 PARTS ('p') — two cogs and a spanner. The mock's conic-gradient discs, rebuilt as real teeth.
export const parts = (opts = {}) =>
  item('parts', opts, (s) => {
    ground(s, 0, 24, 38, 11);
    // Teeth are DEEP (root at 0.68 of the tip) and few (7): at 32 px a shallow many-toothed rim
    // averages back into a plain circle, which is the disc the conic-gradient already gave us.
    const cog = (cx, cy, rOut, teeth, rim, hub) => {
      s.path(gearPath(cx, cy, rOut, rOut * 0.68, teeth), { fill: rim });
      s.circle({ cx, cy, r: rOut * 0.68, fill: rim });
      s.circle({ cx, cy, r: rOut * 0.3, fill: hub });
    };
    cog(-15, 9, 19, 7, '#9fadb8', '#2b3742');
    cog(17, 18, 14, 7, '#c9b083', '#2b3742');
    // spanner across the top, and a nut
    s.raw(
      '<g transform="translate(-2 -20) rotate(-18)"><rect x="-18" y="-5.5" width="36" height="11" rx="3" fill="' +
        s.lin([
          ['0', '#b8c6cf'],
          ['1', '#6b7a85'],
        ]) +
        '"/></g>',
    );
    s.rect({ x: 18, y: -30, w: 14, h: 14, rx: 3, fill: '#8fa2ad' });
    s.border({ x: 18, y: -30, w: 14, h: 14, rx: 3, color: '#4a5560', width: 2 });
  });

// 65 CONTROLLER MODULE ('c') — a green board with gold traces and comb-like edge pins.
// The mock's pulsing status LED is a STATIC lit dot here; see translation note 2 in the header.
export const controllerModule = (opts = {}) =>
  item('controller-module', opts, (s, { powered }) => {
    ground(s, 0, 26, 34, 9);
    s.rect({
      x: -30,
      y: -24,
      w: 60,
      h: 48,
      rx: 4,
      fill: s.lin([
        ['0', '#1e4a3a'],
        ['1', '#16362a'],
      ]),
    });
    s.border({ x: -30, y: -24, w: 60, h: 48, rx: 4, color: '#0d2019', width: 2 });
    // gold traces
    s.rect({ x: -22, y: 12.5, w: 44, h: 3, fill: '#c9a961' });
    s.rect({ x: -13.5, y: -2, w: 3, h: 18, fill: '#c9a961' });
    s.rect({ x: 12.5, y: -2, w: 3, h: 18, fill: '#c9a961' });
    // edge pins — three a side, the comb that makes the rectangle a BOARD and not a crate
    for (const px of [-40, 28]) {
      for (const py of [-6, 0, 6]) s.rect({ x: px, y: py - 2, w: 12, h: 4, fill: '#c9a961' });
    }
    // the chip
    s.rect({ x: -12, y: -14, w: 24, h: 20, rx: 2, fill: '#2b3742' });
    s.border({ x: -12, y: -14, w: 24, h: 20, rx: 2, color: '#4a5560', width: 1 });
    // status LED — glow, then the dot; dimmed rather than animated
    s.glow(20, -16, 9, 'rgba(90,167,127,.65)', powered ? 1 : 0.15);
    s.circle({ cx: 20, cy: -16, r: 3, fill: powered ? '#5aa77f' : '#2f4f3f' });
  });

// 66 SEALS ('g') — two O-rings and a hatched gasket card. The only piece with holes through it.
export const seals = (opts = {}) =>
  item('seals', opts, (s) => {
    ground(s, 0, 26, 34, 10);
    // an annulus is the mock's `inset 0 0 0 Npx` on a dark disc: dark core + a thick stroked ring
    const oring = (cx, cy, r, ring, w) => {
      s.circle({ cx, cy, r, fill: '#2f3a33' });
      s.circle({ cx, cy, r: r - w / 2, fill: 'none', stroke: ring, sw: w });
    };
    // THE RINGS COME FIRST AND STAY UNCOVERED. The mock lays its gasket card across their tops; at
    // 32 px that hides the holes, and the holes ARE the silhouette — they are the only place in the
    // whole 68-piece set where the floor shows through the middle of a thing. The card is therefore
    // moved clear, up and to the right, rather than kept where the mock had it.
    oring(-17, 12, 21, '#5f8a67', 9);
    oring(15, 20, 15, '#4d6b52', 7);
    // the gasket card, with the mock's vertical hatch
    const card = { x: 2, y: -32, w: 34, h: 24 };
    s.rect({ ...card, rx: 4, fill: '#c9b083' });
    s.rect({
      ...card,
      rx: 4,
      fill: s.pat('<rect width="7" height="24" fill="none"/><rect x="5" width="2" height="24" fill="rgba(0,0,0,.18)"/>', {
        w: 7,
        h: 24,
      }),
    });
    s.border({ ...card, rx: 4, color: '#93805a', width: 2 });
  });

// 67 ICE ('i') — faceted pale-blue blocks with a cold bloom. The only cold hue in the set.
export const ice = (opts = {}) =>
  item('ice', opts, (s) => {
    ground(s, 0, 26, 36, 10);
    const block = (x, y, w, h, a, b, edge) => {
      s.rect({
        x: x - w / 2,
        y: y - h / 2,
        w,
        h,
        rx: 4,
        fill: s.lin(
          [
            ['0', a],
            ['1', b],
          ],
          'diag',
        ),
      });
      s.border({ x: x - w / 2, y: y - h / 2, w, h, rx: 4, color: edge, width: 2 });
    };
    block(-16, 14, 30, 26, 'rgba(190,230,245,.95)', 'rgba(120,175,205,.85)', 'rgba(255,255,255,.5)');
    block(16, 16, 26, 23, 'rgba(175,220,240,.9)', 'rgba(105,160,192,.85)', 'rgba(255,255,255,.45)');
    s.glow(0, -8, 26, 'rgba(150,210,240,.3)');
    block(0, -8, 36, 32, 'rgba(210,242,252,.95)', 'rgba(130,185,215,.88)', 'rgba(255,255,255,.6)');
    // the specular streak — a single tilted highlight, the thing that says "frozen" and not "glass"
    s.raw('<g transform="translate(-6 -14) rotate(-30)"><rect x="-8" y="-1.5" width="16" height="3" rx="1.5" fill="rgba(255,255,255,.75)"/></g>');
  });

// 68 CORPSE ('&') — a sealed body bag: one tall capsule, ribbed, strapped, with a blank ID tag.
//
// TWO THINGS IN THE MOCK ARE DELIBERATELY NOT DRAWN. Its tag reads `ROJAS` and it carries a literal
// `&` above the bag. A NAME would be a fabrication — this builder is a pure function of `opts` and
// knows nothing about who died, so any name it drew would be the same name for every corpse on the
// ship — and the `&` is the ASCII stand-in this whole package exists to remove. The tag is drawn as
// the amber-edged plate, empty: "there is a name on this, and it is not mine to write".
export const corpse = (opts = {}) =>
  item('corpse', opts, (s) => {
    ground(s, 0, 44, 24, 8);
    const body = { x: -26, y: -37, w: 52, h: 86 };
    s.path(roundedRectPath(body.x, body.y, body.w, body.h, { tl: 22, tr: 22, br: 8, bl: 8 }), {
      fill: s.lin([
        ['0', '#8d8578'],
        ['1', '#6d6659'],
      ]),
    });
    // the ribs of the bag — horizontal creases, the mock's repeating-linear-gradient
    for (const ry of [-24, -11, 2, 15, 28]) {
      s.rect({ x: body.x, y: ry, w: body.w, h: 2, fill: 'rgba(0,0,0,.12)' });
    }
    // two straps
    s.rect({ x: body.x, y: -18.5, w: body.w, h: 3, fill: 'rgba(0,0,0,.28)' });
    s.rect({ x: body.x, y: 19.5, w: body.w, h: 3, fill: 'rgba(0,0,0,.28)' });
    // the blank ID tag
    s.rect({ x: -17, y: -5, w: 34, h: 14, rx: 2, fill: '#3a2a12' });
    s.border({ x: -17, y: -5, w: 34, h: 14, rx: 2, color: '#cf7a33', width: 1 });
  });
