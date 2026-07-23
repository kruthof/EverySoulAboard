// The 18 FIXTURE builders (#43–60) — doors, hatches, conduits, wall props & lights. Pure
// `(opts) -> string`; geometry/colour translated verbatim from perilune-item-set.dc.html.
// `opts.state:'off'` dims the glow-bearing fixtures (lamps, heater, conduit, floodlight, sun lamp).

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
    s.rect({ x: -32, y: -37, w: 64, h: 74, rx: 4, fill: '#2a323b' });
    s.border({ x: -32, y: -37, w: 64, h: 74, rx: 4, color: '#4a5560', width: 4 });
    for (const cy of [-13, 0, 13]) s.rect({ x: -20, y: cy - 2.5, w: 40, h: 5, rx: 2, fill: '#8fa2ad' });
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

// 48 PIPE RUN — a main run with two elbow branches.
export const pipeRun = (opts = {}) =>
  item('pipe-run', opts, (s) => {
    const pipeH = s.lin([
      ['0', '#5a6672'],
      ['1', '#3a434d'],
    ]);
    const pipeV = s.lin(
      [
        ['0', '#5a6672'],
        ['1', '#3a434d'],
      ],
      'h',
    );
    s.rect({ x: -30, y: 2, w: 16, h: 34, rx: 6, fill: pipeV });
    s.rect({ x: 22, y: -31, w: 16, h: 30, rx: 6, fill: pipeV });
    s.rect({ x: -48, y: -8, w: 96, h: 16, rx: 8, fill: pipeH });
    s.rect({ x: -46, y: -7, w: 92, h: 3, rx: 1.5, fill: 'rgba(255,255,255,.12)' });
  });

// 49 WALL LAMP — a warm sconce with a broad downward glow.
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

// 52 SPACE HEATER — steel box with three glowing element bars.
export const spaceHeater = (opts = {}) =>
  item('space-heater', opts, (s, { powered }) => {
    s.rect({ x: -30, y: -32, w: 60, h: 64, rx: 6, fill: steelBody(s) });
    s.border({ x: -30, y: -32, w: 60, h: 64, rx: 6, color: '#2b3742', width: 2 });
    const bar = s.rad([
      [0, '#f2b563'],
      [1, '#e8863c'],
    ]);
    for (const cy of [-13, 0, 13]) {
      s.glow(0, cy, 24, 'rgba(232,134,60,.5)', powered ? 1 : 0.12, 5);
      s.rect({ x: -20, y: cy - 3.5, w: 40, h: 7, rx: 3, fill: powered ? bar : '#6b4a26' });
    }
  });

// 53 VENT FAN — a four-blade fan in a steel housing.
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

// 54 SHELF RACK — a steel shelf with two rows of stacked crates.
export const shelfRack = (opts = {}) =>
  item('shelf-rack', opts, (s) => {
    s.rect({ x: -44, y: -38, w: 88, h: 76, rx: 5, fill: '#4a5560' });
    s.border({ x: -44, y: -38, w: 88, h: 76, rx: 5, color: '#38424d', width: 3 });
    const row = (cy, colors) => {
      const gap = 6;
      const total = colors.length * 22 + (colors.length - 1) * gap;
      let bx = -total / 2;
      for (const c of colors) {
        s.rect({ x: bx, y: cy - 8, w: 22, h: 16, rx: 2, fill: c });
        bx += 22 + gap;
      }
    };
    row(-18, ['#c8935a', '#7a5c38', '#c14a32']);
    row(16, ['#5aa77f', '#c8935a', '#5a9fd4']);
  });

// 55 SUPPLY BARREL — a blue drum with a hazard-striped top band.
export const supplyBarrel = (opts = {}) =>
  item('supply-barrel', opts, (s) => {
    s.rect({
      x: -24,
      y: -32,
      w: 48,
      h: 64,
      rx: 8,
      fill: s.lin(
        [
          ['0', '#5a9fd4'],
          ['0.55', '#3d7fb0'],
          ['1', '#2f6690'],
        ],
        'h',
      ),
    });
    s.border({ x: -24, y: -32, w: 48, h: 64, rx: 8, color: '#274f61', width: 2 });
    s.rect({
      x: -24,
      y: -13,
      w: 48,
      h: 10,
      fill: s.pat('<rect width="14" height="10" fill="#274f61"/><rect width="7" height="10" fill="#cfe0ff"/>', {
        w: 14,
        h: 10,
        transform: 'rotate(45)',
      }),
    });
  });

// 56 WEAPONS RACK — a steel rack holding four vertical rods.
export const weaponsRack = (opts = {}) =>
  item('weapons-rack', opts, (s) => {
    s.rect({ x: -44, y: -30, w: 88, h: 60, rx: 5, fill: '#38424d' });
    s.border({ x: -44, y: -30, w: 88, h: 60, rx: 5, color: '#2b3742', width: 3 });
    const gap = 8;
    const total = 4 * 6 + 3 * gap;
    let rx = -total / 2;
    for (let i = 0; i < 4; i++) {
      s.rect({ x: rx, y: -22, w: 6, h: 44, rx: 2, fill: '#8fa2ad' });
      rx += 6 + gap;
    }
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

// 58 HERB PLANTER — a small wall planter with a green crown.
export const herbPlanter = (opts = {}) =>
  item('herb-planter', opts, (s) => {
    s.path(roundedRectPath(-22, 1, 44, 30, { bl: 8, br: 8 }), {
      fill: s.lin([
        ['0', '#8a5a38'],
        ['1', '#6b4527'],
      ]),
    });
    s.glow(0, -14, 32, 'rgba(95,138,58,.35)');
    s.circle({
      cx: 0,
      cy: -14,
      r: 25,
      fill: s.rad(
        [
          [0, '#6f9c48'],
          [1, '#3f6b2a'],
        ],
        { cx: 0.45, cy: 0.4 },
      ),
    });
  });

// 59 DECK SIGN — a wayfinding sign on a post.
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
