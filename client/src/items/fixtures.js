// The FIXTURE builders (#43–60) — doors, hatches, conduits, wall props & lights. Pure
// `(opts) -> string`; geometry/colour translated verbatim from perilune-item-set.dc.html.
// `opts.state:'off'` dims the glow-bearing fixtures (lamps, conduit, floodlight, sun lamp).
//
// ⚠️ IT WAS 18 AND IS NOW 13, for the same reason `objects.js`'s header records: VR-P2 retired
// `pipe-run`, `space-heater`, `shelf-rack`, `supply-barrel` and `herb-planter`, whose registry rows
// now point at `client/src/items/fittings.js`. `space-heater` leaving is the one worth noticing
// twice — it is the piece `GLYPH_SUBSTITUTE['=']` (Radiator) borrows, so TWO device kinds now wear
// the fittings catalogue's heater rather than this file's.

import { item, roundedRectPath } from './helpers.js';

const steelBody = (s) =>
  s.lin([
    ['0', '#4a5560'],
    ['1', '#38424d'],
  ]);
const screenTeal = (s) =>
  s.lin([
    ['0', '#0e3a44'],
    ['1', '#0b2a32'],
  ]);

// 43 SLIDING DOOR — steel leaf with a bright amber centre light-strip.
export const slidingDoor = (opts = {}) =>
  item('sliding-door', opts, (s, { powered }) => {
    s.rect({ x: -48, y: -35, w: 96, h: 70, rx: 5, fill: steelBody(s) });
    s.border({ x: -48, y: -35, w: 96, h: 70, rx: 5, color: '#2b3742', width: 3 });
    s.glow(0, 0, 14, 'rgba(232,147,74,.5)', powered ? 1 : 0.2, 35);
    s.rect({ x: -3, y: -35, w: 6, h: 70, fill: powered ? '#e8934a' : '#7a5230' });
  });

// 44 AIRLOCK — circular vacuum-boundary hatch with an amber seam.
export const airlock = (opts = {}) =>
  item('airlock', opts, (s, { powered }) => {
    s.circle({ cx: 0, cy: 0, r: 40, fill: steelBody(s) });
    s.circle({ cx: 0, cy: 0, r: 37.5, fill: 'none', stroke: '#2b3742', sw: 5 });
    s.circle({ cx: 0, cy: 0, r: 23, fill: '#2a323b' });
    s.circle({ cx: 0, cy: 0, r: 21.5, fill: 'none', stroke: '#1c242d', sw: 3 });
    s.glow(0, 0, 30, 'rgba(232,147,74,.4)', powered ? 1 : 0.2, 6);
    s.rect({ x: -26, y: -3, w: 52, h: 6, fill: powered ? '#e8934a' : '#7a5230' });
  });

// 45 HATCH / LADDER — recessed steel frame with three rungs.
export const hatchLadder = (opts = {}) =>
  item('hatch-ladder', opts, (s) => {
    // REDRAWN 2026-07-27. The old piece was a dark ROUNDED RECTANGLE with three grey bars across it —
    // at tile size, a locker with a stripe, or an air vent. A deck hatch is a ROUND hole you look
    // down: the circular rim is the whole read, and the rungs receding light-to-dark inside it are
    // what say the hole has depth. The mock's `▼` deck marker is drawn as a triangle rather than set
    // as 8-px text, so it survives the downscale (see objects.js's TEXT RULE note).
    s.circle({ cx: 0, cy: 0, r: 40, fill: '#151d24' });
    s.circle({ cx: 0, cy: 0, r: 37, fill: 'none', stroke: '#4a5560', sw: 6 });
    for (const dx of [-24.5, 19.5]) {
      s.rect({ x: dx, y: -37, w: 5, h: 74, rx: 3, fill: s.lin([['0', '#8fa2ad'], ['1', '#38424d']]) });
    }
    for (const [cy, a, b] of [[-18, '#b8c6cf', '#7d8b96'], [0, '#9fadb8', '#66737e'], [18, '#7d8b96', '#4f5c66']]) {
      s.rect({ x: -22, y: cy - 3.5, w: 44, h: 7, rx: 3, fill: s.lin([['0', a], ['1', b]]) });
    }
    s.rect({ x: -13, y: -49, w: 26, h: 10, rx: 3, fill: '#3a2a12' });
    s.border({ x: -13, y: -49, w: 26, h: 10, rx: 3, color: '#cf7a33', width: 1 });
    s.path('M-4,-46.5L4,-46.5L0,-41.5Z', { fill: '#f2b563' });
  });

// 46 POWER CONDUIT — dark bar with three glowing amber nodes.
export const powerConduit = (opts = {}) =>
  item('power-conduit', opts, (s, { powered }) => {
    s.rect({ x: -48, y: -7, w: 96, h: 14, rx: 7, fill: '#2b3742' });
    for (const cx of [-30, 0, 30]) {
      s.glow(cx, 0, 12, 'rgba(232,147,74,.55)', powered ? 1 : 0.2);
      s.circle({ cx, cy: 0, r: 6, fill: powered ? '#e8934a' : '#6b4a26' });
    }
  });

// 47 AIR VENT — steel housing over a louvred grille.
export const airVent = (opts = {}) =>
  item('air-vent', opts, (s) => {
    s.rect({ x: -36, y: -28, w: 72, h: 56, rx: 5, fill: steelBody(s) });
    s.border({ x: -36, y: -28, w: 72, h: 56, rx: 5, color: '#2b3742', width: 2 });
    s.rect({
      x: -28,
      y: -20,
      w: 56,
      h: 40,
      rx: 3,
      fill: s.pat('<rect width="9" height="9" fill="#5a6672"/><rect width="9" height="5" fill="#2b3742"/>', {
        w: 9,
        h: 9,
      }),
    });
  });
export const wallLamp = (opts = {}) =>
  item('wall-lamp', opts, (s, { powered }) => {
    s.rect({ x: -11, y: -3, w: 22, h: 34, rx: 4, fill: '#4a5560' });
    s.border({ x: -11, y: -3, w: 22, h: 34, rx: 4, color: '#2b3742', width: 2 });
    s.glow(0, -14, 44, 'rgba(232,134,60,.55)', powered ? 1 : 0.12);
    s.path(roundedRectPath(-26, -31, 52, 34, { tl: 16, tr: 16, bl: 6, br: 6 }), {
      fill: powered
        ? s.rad(
            [
              [0, '#f2b563'],
              [1, '#e8863c'],
            ],
            { cx: 0.5, cy: 0.8 },
          )
        : '#6b4a26',
    });
  });

// 50 VIEWPORT — a porthole to the stars in a steel ring.
export const viewport = (opts = {}) =>
  item('viewport', opts, (s) => {
    s.rect({ x: -51, y: -38, w: 102, h: 76, rx: 12, fill: '#3a4b5c' }); // outer ring (box-shadow 0 0 0 6px)
    s.rect({
      x: -45,
      y: -32,
      w: 90,
      h: 64,
      rx: 8,
      fill: s.rad(
        [
          [0, '#1c3a52'],
          [1, '#0c1a26'],
        ],
        { cx: 0.4, cy: 0.35 },
      ),
    });
    s.circle({ cx: -18, cy: -10, r: 1.5, fill: '#ffffff' });
    s.circle({ cx: 20, cy: 8, r: 1, fill: '#ffe9cf' });
  });

// 51 WALL SCREEN — a decorative cyan display in a steel bezel.
export const wallScreen = (opts = {}) =>
  item('wall-screen', opts, (s) => {
    s.rect({ x: -46, y: -30, w: 92, h: 60, rx: 5, fill: '#232b33' });
    s.border({ x: -46, y: -30, w: 92, h: 60, rx: 5, color: '#3a4b5c', width: 3 });
    s.glow(0, 0, 30, 'rgba(90,200,220,.5)', 1, 20);
    s.rect({ x: -38, y: -22, w: 76, h: 44, rx: 3, fill: screenTeal(s) });
  });
export const ventFan = (opts = {}) =>
  item('vent-fan', opts, (s) => {
    s.rect({ x: -38, y: -38, w: 76, h: 76, rx: 8, fill: '#38424d' });
    s.border({ x: -38, y: -38, w: 76, h: 76, rx: 8, color: '#2b3742', width: 3 });
    s.circle({ cx: 0, cy: 0, r: 30, fill: '#3a434d' });
    // four alternating quarter-blades (conic-gradient approximation)
    s.path('M0,0 L0,-30 A30,30 0 0 1 30,0 Z', { fill: '#5a6672' });
    s.path('M0,0 L0,30 A30,30 0 0 1 -30,0 Z', { fill: '#5a6672' });
    s.circle({ cx: 0, cy: 0, r: 28.5, fill: 'none', stroke: '#2b3742', sw: 3 });
    s.circle({ cx: 0, cy: 0, r: 6, fill: '#8fa2ad' });
  });
export const weaponsRack = (opts = {}) =>
  item('weapons-rack', opts, (s) => {
    // REDRAWN 2026-07-27. The old piece was four identical grey bars on a navy panel — a radiator, a
    // shelf rack or a vent. A rack reads as a rack when the arms have BUTTS: a steel barrel above a
    // wooden stock, resting on a top rail and standing on a timber shelf, with an ammunition crate at
    // the end. Three arms of two different lengths, not four of one, so it does not re-average into
    // a stripe pattern at tile size.
    s.rect({ x: -48, y: -37, w: 96, h: 74, rx: 5, fill: '#38424d' });
    s.border({ x: -48, y: -37, w: 96, h: 74, rx: 5, color: '#2b3742', width: 3 });
    s.rect({ x: -48, y: -34, w: 96, h: 8, fill: '#2b3742' });    // the rail the barrels rest against
    s.rect({ x: -48, y: 26, w: 96, h: 8, fill: '#5a442c' });     // the timber butt-shelf
    // the barrels are LIGHT against the navy panel: at 40 px a #4a5560 barrel on a #38424d
    // back-plate has almost no edge and the rack re-averages into a flat rectangle.
    const barrel = s.lin([['0', '#b8c6cf'], ['1', '#6b7a85']]);
    for (const [bx, by, bh, sx, sy, sw, sh] of [
      [-32.5, -28, 56, -35.5, 6, 15, 20],
      [-8.5, -28, 56, -11.5, 6, 15, 20],
      [17.5, -26, 40, 15, 2, 14, 16],
    ]) {
      s.rect({ x: bx, y: by, w: 9, h: bh, rx: 2, fill: barrel });
      s.rect({ x: sx, y: sy, w: sw, h: sh, rx: 3, fill: '#6b4a2a' });
    }
    s.rect({ x: 30, y: -9, w: 20, h: 26, rx: 3, fill: '#4a5560' });   // ammunition crate
    s.border({ x: 30, y: -9, w: 20, h: 26, rx: 3, color: '#2b3742', width: 2 });
    s.rect({ x: 30, y: -7, w: 20, h: 6, fill: '#c14a32' });
  });

// 57 SUN LAMP — a broad grow-light with a big warm glow.
export const sunLamp = (opts = {}) =>
  item('sun-lamp', opts, (s, { powered }) => {
    s.rect({ x: -4, y: 0, w: 8, h: 40, fill: '#4a5560' });
    s.glow(0, -16, 48, 'rgba(255,220,150,.55)', powered ? 1 : 0.12);
    s.path(roundedRectPath(-35, -36, 70, 40, { tl: 8, tr: 8, bl: 4, br: 4 }), {
      fill: powered
        ? s.rad(
            [
              [0, '#fff6d8'],
              [0.55, '#f2b563'],
              [1, '#e8863c'],
            ],
            { cx: 0.5, cy: 0.9 },
          )
        : '#6b4a26',
    });
  });
export const deckSign = (opts = {}) =>
  item('deck-sign', opts, (s) => {
    s.rect({ x: -3, y: 0, w: 6, h: 40, fill: '#4a5560' });
    s.rect({
      x: -40,
      y: -25,
      w: 80,
      h: 34,
      rx: 5,
      fill: s.lin([
        ['0', '#3a2a12'],
        ['1', '#2a1e0c'],
      ]),
    });
    s.border({ x: -40, y: -25, w: 80, h: 34, rx: 5, color: '#cf7a33', width: 2 });
    s.text('2 ▸', { x: 0, y: -8, size: 15, weight: 700, fill: '#f2b563' });
  });

// 60 FLOODLIGHT — a steel head casting a hard warm cone.
export const floodlight = (opts = {}) =>
  item('floodlight', opts, (s, { powered }) => {
    s.rect({ x: -4, y: 0, w: 8, h: 40, fill: '#38424d' });
    s.rect({ x: -20, y: -31, w: 40, h: 30, rx: 6, fill: '#4a5560' });
    s.border({ x: -20, y: -31, w: 40, h: 30, rx: 6, color: '#2b3742', width: 2 });
    s.glow(24, -16, 34, 'rgba(255,220,150,.5)', powered ? 1 : 0.12);
    s.rect({
      x: 9,
      y: -27,
      w: 30,
      h: 22,
      rx: 3,
      fill: powered
        ? s.rad(
            [
              [0, '#fff6d8'],
              [0.6, '#f2b563'],
              [1, 'rgba(242,181,99,0)'],
            ],
            { cx: 0.2, cy: 0.5 },
          )
        : '#6b4a26',
    });
  });
