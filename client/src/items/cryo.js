// The 2 CRYO CAPSULE builders (#69–70) — the pieces the 2026-07-28 mock re-import added to the
// static catalog. Pure `(opts) -> string` SVG-`<g>`-fragment builders in the same centred mock-px
// space as objects.js / fixtures.js / resources.js; see helpers.js for the
// coordinate model. Geometry + colour translated from docs/design/perilune-item-set.dc.html.
//
// WHY THESE ARE A FILE OF THEIR OWN, and not two more rows in objects.js: they are ONE OBJECT IN
// TWO STATES, and that is a shape nothing else in the registry has. Every other piece in the set is
// a thing; these are a thing and a fact about it (is there someone in it). Keeping them together
// makes the pair legible and makes the pair revertible — the mock landed them in one import and
// they leave in one commit.
//
// ⚠️ THEY ARE NOT THE PRE-EXISTING `cryopod` PIECE, and the difference matters when you are looking
// for the right one. `cryopod` (objects.js #29, unchanged by this import) is a 48×82 lozenge seen
// from directly above — a frosted cyan window in a steel shell, no occupant, no state. These are
// 60×104 UPRIGHT capsules that say which of two things is true of the tile. The mock ships all
// three side by side; nothing was replaced.
//
// ⚠️ NEITHER CLAIMS A GLYPH, AND THAT IS DELIBERATE, NOT AN OVERSIGHT. There is no `DeviceKind` for
// a cryo capsule in `sim/Sim.Core/Device.cs`, so there is no `Glyphs.ForDevice` char to claim and
// no tile the sim would ever project one onto. They are registered COSMETIC — the same class
// `cryopod` already sits in — which is the honest classification for a piece the sim does not know
// about. Giving either one a glyph it does not own would make `items/glyph-map.js` skin a tile with
// art for a device that is not there.
//
// TWO TRANSLATIONS THE MOCK FORCED:
//
// 1. THE PLATE TEXT IS DROPPED — `-196°` and `EMPTY`, both authored at 7 mock-px. objects.js's TEXT
//    RULE (waterRecycler's header) keeps a mock glyph only at ≥ 15 mock-px; below that it is a
//    smudge at the size a tile actually draws and costs more than it tells. The PLATES stay, in
//    their own colours — cyan-edged for the occupied capsule, amber-edged for the empty one — which
//    is the same decision resources.js's `corpse` made for its blank ID tag: "there is a readout
//    here, and it is not legible at this size".
// 2. THE PULSING LED IS STATIC — the mock's `@keyframes pulse`. A builder is `(opts) -> string`
//    with "no DOM, no clock, no randomness" (helpers.js:1-7); a SMIL `<animate>` would keep the
//    string pure and make the PIXELS a function of wall-clock time, which no assertion in this repo
//    can see and every screenshot comparison would trip over. Expressed the set's way instead: a
//    static `s.glow` behind the dot, dimmed by `opts.state`.

import { item, roundedRectPath } from './helpers.js';

/** The capsule shell + its recessed window well — the half both states share, in their own tints. */
function shell(s, shellStops, wellStops, wellShade) {
  s.path(roundedRectPath(-30, -52, 60, 104, { tl: 26, tr: 26, br: 8, bl: 8 }), {
    fill: s.lin(shellStops, 'h'),
  });
  s.path(roundedRectPath(-27, -49, 54, 98, { tl: 23, tr: 23, br: 5, bl: 5 }), {
    fill: 'none',
    stroke: '#232b33',
    sw: 3,
  });
  const well = roundedRectPath(-22, -46, 44, 80, { tl: 20, tr: 20, br: 5, bl: 5 });
  s.path(well, { fill: s.lin(wellStops) });
  // the mock's `inset 0 0 Npx rgba(0,0,0,…)` — a soft dark rim inside the well, drawn as a wide
  // low-opacity inner stroke rather than a blur filter (filters are not in this set's vocabulary).
  s.path(roundedRectPath(-19, -43, 38, 74, { tl: 17, tr: 17, br: 4, bl: 4 }), {
    fill: 'none',
    stroke: wellShade,
    sw: 6,
    opacity: 0.55,
  });
}

/** The status plate at the foot — a coloured, deliberately textless readout (translation note 1). */
function plate(s, fill, edge) {
  s.rect({ x: -22, y: 38.5, w: 44, h: 11, rx: 2, fill });
  s.border({ x: -22, y: 38.5, w: 44, h: 11, rx: 2, color: edge, width: 1 });
}

// 69 CRYO CAPSULE · OCCUPIED — a crew member frozen behind frost glass, cyan `-196°` plate, live LED.
export const cryoCapsuleOccupied = (opts = {}) =>
  item('cryo-capsule-occupied', opts, (s, { powered }) => {
    shell(
      s,
      [['0', '#5a6672'], ['0.55', '#38424d'], ['1', '#2b3742']],
      [['0', '#183848'], ['1', '#102734']],
      'rgba(0,0,0,.7)',
    );
    // the occupant. Drawn BEFORE the frost glass, which is the whole point of the piece: the glass
    // is what makes a person into a person-you-cannot-reach.
    s.path(roundedRectPath(-15, -44, 30, 32, { tl: 12, tr: 12, br: 3, bl: 3 }), { fill: '#2b2018' });
    s.path(roundedRectPath(-12, -39.5, 24, 27, { tl: 10, tr: 10, br: 3, bl: 3 }), { fill: '#a97a4e' });
    s.rect({ x: -7, y: -29, w: 4, h: 4, fill: '#2a201a' });
    s.rect({ x: 3, y: -29, w: 4, h: 4, fill: '#2a201a' });
    s.rect({ x: -17, y: -13, w: 34, h: 30, rx: 4, fill: '#9ba1a6' });
    s.rect({ x: -24, y: -10, w: 8, h: 20, rx: 3, fill: '#9ba1a6' });
    s.rect({ x: 16, y: -10, w: 8, h: 20, rx: 3, fill: '#9ba1a6' });
    s.rect({ x: -13.5, y: 17, w: 11, h: 18, rx: 2, fill: '#26201a' });
    s.rect({ x: 2.5, y: 17, w: 11, h: 18, rx: 2, fill: '#26201a' });
    // frost glass over the occupant, then its single specular streak
    s.path(roundedRectPath(-22, -46, 44, 80, { tl: 20, tr: 20, br: 5, bl: 5 }), {
      fill: s.lin(
        [['0', 'rgba(200,238,250,.42)'], ['0.55', 'rgba(120,180,212,.24)'], ['1', 'rgba(200,238,250,.36)']],
        'diag',
      ),
    });
    s.path(roundedRectPath(-20, -44, 40, 76, { tl: 18, tr: 18, br: 4, bl: 4 }), {
      fill: 'none',
      stroke: 'rgba(255,255,255,.4)',
      sw: 4,
    });
    s.raw('<g transform="translate(-9 -34) rotate(-32)"><rect x="-8" y="-1.5" width="16" height="3"'
      + ' rx="1.5" fill="rgba(255,255,255,.7)"/></g>');
    plate(s, '#0b2a32', '#2f6a7a');
    s.glow(24, -40, 11, 'rgba(90,159,212,.7)', powered ? 1 : 0.15);
    s.circle({ cx: 24, cy: -40, r: 3.5, fill: powered ? '#5a9fd4' : '#2e4b63' });
  });

// 70 CRYO CAPSULE · OPEN — the same shell, empty: a padded bed, the lid hinged open, icicles, an
// amber `EMPTY` plate. The lid at rotate(24deg) is the silhouette: nothing else in the set sticks a
// long pale panel out sideways, so an open capsule reads as open at tile size.
export const cryoCapsuleOpen = (opts = {}) =>
  item('cryo-capsule-open', opts, (s) => {
    shell(
      s,
      [['0', '#4a5560'], ['0.55', '#333d47'], ['1', '#262f38']],
      [['0', '#1d262e'], ['1', '#141b21']],
      'rgba(0,0,0,.85)',
    );
    // the empty padded bed
    s.path(roundedRectPath(-16, -26, 32, 56, { tl: 14, tr: 14, br: 4, bl: 4 }), {
      fill: s.lin([['0', '#3d3730'], ['1', '#2c2823']]),
    });
    s.path(roundedRectPath(-13, -23, 26, 50, { tl: 11, tr: 11, br: 3, bl: 3 }), {
      fill: 'none',
      stroke: 'rgba(0,0,0,.6)',
      sw: 4,
    });
    // the hinged lid, swung open to the right
    s.raw(
      '<g transform="translate(40 -14) rotate(24)">'
      + `<path d="${roundedRectPath(-13, -44, 26, 88, { tl: 14, tr: 14, br: 5, bl: 5 })}" fill="`
      + s.lin([['0', 'rgba(190,230,245,.5)'], ['1', 'rgba(110,165,195,.32)']], 'h')
      + `"/><path d="${roundedRectPath(-11.5, -42.5, 23, 85, { tl: 12.5, tr: 12.5, br: 3.5, bl: 3.5 })}"`
      + ' fill="none" stroke="#4a5560" stroke-width="3"/></g>',
    );
    // three icicles on the rim. The mock clips a rect with `polygon(0 0,100% 0,50% 100%)`; a
    // downward triangle is that polygon, drawn rather than clipped — SVG needs no clip for it.
    const icicle = (cx, cy, w, h, top, bot) => {
      s.path(
        `M${cx - w / 2},${cy - h / 2}L${cx + w / 2},${cy - h / 2}L${cx},${cy + h / 2}Z`,
        { fill: s.lin([['0', top], ['1', bot]]) },
      );
    };
    icicle(-14, -42, 6, 20, 'rgba(225,246,252,.95)', 'rgba(150,205,232,.6)');
    icicle(-4, -40, 5, 14, 'rgba(225,246,252,.9)', 'rgba(150,205,232,.55)');
    icicle(6, -44, 7, 24, 'rgba(225,246,252,.95)', 'rgba(150,205,232,.6)');
    // the frost puddle at the foot — meltwater, the only thing in the piece that is not structure
    s.ellipse({
      cx: -2,
      cy: 34,
      rx: 17,
      ry: 6,
      fill: s.rad([['0', 'rgba(190,230,245,.5)'], ['0.7', 'rgba(190,230,245,0)'], ['1', 'rgba(190,230,245,0)']]),
    });
    plate(s, '#2a1e0c', '#a1591f');
  });
