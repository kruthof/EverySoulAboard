// The 30 OBJECT builders (structures & furniture) of the warm item set. Each is a pure
// `(opts) -> string` SVG-`<g>`-fragment builder; geometry + colour are translated verbatim from
// docs/design/perilune-item-set.dc.html (element numbers 1–30). Authored in centred mock-px space;
// see helpers.js for the coordinate/normalisation model. `opts.state:'off'` dims a lit device's glow.

import { item, roundedRectPath } from './helpers.js';

// 1 REACTOR — glowing core, amber ember radial + navy inset ring.
export const reactor = (opts = {}) =>
  item('reactor', opts, (s, { powered }) => {
    s.glow(0, -3, 54, 'rgba(232,134,60,.5)', powered ? 1 : 0.15);
    const core = s.rad(
      [
        [0, '#ffe6b0'],
        [0.45, '#e8863c'],
        [1, '#8a3a1f'],
      ],
      { cx: 0.5, cy: 0.4 },
    );
    s.circle({ cx: 0, cy: 0, r: 32, fill: powered ? core : '#8a3a1f' });
    s.circle({ cx: 0, cy: 0, r: 29.5, fill: 'none', stroke: '#39424c', sw: 5 });
  });

// 2 SOLAR PANEL — blue photovoltaic grid with a cream frame.
export const solarPanel = (opts = {}) =>
  item('solar-panel', opts, (s) => {
    const g = s.lin([
      ['0', '#2f5f74'],
      ['1', '#274f61'],
    ]);
    s.rect({ x: -46, y: -28, w: 92, h: 56, rx: 4, fill: g });
    const grid = s.pat(
      '<rect width="22" height="18" fill="none"/><rect width="22" height="2" fill="rgba(0,0,0,.35)"/><rect width="2" height="18" fill="rgba(0,0,0,.35)"/>',
      { w: 22, h: 18 },
    );
    s.rect({ x: -46, y: -28, w: 92, h: 56, rx: 4, fill: grid });
    s.border({ x: -46, y: -28, w: 92, h: 56, rx: 4, color: '#d9c9a0', width: 4 });
  });

// 3 BATTERY BANK — two navy cells, a green-charged + an amber-charged bar.
export const batteryBank = (opts = {}) =>
  item('battery-bank', opts, (s) => {
    const cell = () =>
      s.lin([
        ['0', '#3a4b5c'],
        ['1', '#28323d'],
      ]);
    // left cell
    s.rect({ x: -29, y: -28, w: 26, h: 56, rx: 4, fill: cell() });
    s.border({ x: -29, y: -28, w: 26, h: 56, rx: 4, color: '#1c242d', width: 2 });
    s.glow(-16, 8, 16, 'rgba(90,167,127,.4)');
    s.rect({ x: -24, y: -7, w: 16, h: 30, rx: 2, fill: '#5aa77f' });
    // right cell
    s.rect({ x: 3, y: -28, w: 26, h: 56, rx: 4, fill: cell() });
    s.border({ x: 3, y: -28, w: 26, h: 56, rx: 4, color: '#1c242d', width: 2 });
    s.glow(16, 13, 16, 'rgba(232,147,74,.4)');
    s.rect({ x: 8, y: 3, w: 16, h: 20, rx: 2, fill: '#e8934a' });
  });

// 4 O2 SCRUBBER — steel body, intake louvres, a cyan readout.
export const o2Scrubber = (opts = {}) =>
  item('o2-scrubber', opts, (s) => {
    s.rect({
      x: -33,
      y: -30,
      w: 66,
      h: 60,
      rx: 6,
      fill: s.lin([
        ['0', '#4a5560'],
        ['1', '#38424d'],
      ]),
    });
    s.border({ x: -33, y: -30, w: 66, h: 60, rx: 6, color: '#2b3742', width: 2 });
    s.rect({
      x: -20,
      y: -5,
      w: 40,
      h: 6,
      rx: 2,
      fill: s.pat('<rect width="8" height="6" fill="#5a6672"/><rect width="4" height="6" fill="#2b3742"/>', {
        w: 8,
        h: 6,
      }),
    });
    s.glow(0, 16, 22, 'rgba(90,200,220,.4)', 1, 9);
    s.rect({
      x: -17,
      y: 10.5,
      w: 34,
      h: 11,
      rx: 2,
      fill: s.lin([
        ['0', '#0e3a44'],
        ['1', '#0b2a32'],
      ]),
    });
  });

// 5 OXYGEN TANK — blue pressure cylinder + top valve.
export const oxygenTank = (opts = {}) =>
  item('oxygen-tank', opts, (s) => {
    s.rect({
      x: -19,
      y: -35,
      w: 38,
      h: 70,
      rx: 19,
      fill: s.lin(
        [
          ['0', '#5a9fd4'],
          ['0.55', '#3d7fb0'],
          ['1', '#2f6690'],
        ],
        'h',
      ),
    });
    s.border({ x: -19, y: -35, w: 38, h: 70, rx: 19, color: '#274f61', width: 3 });
    s.rect({ x: -7, y: -46, w: 14, h: 12, rx: 2, fill: '#4a5560' });
  });

// 6 WATER RECYCLER — steel body, teal sight-glass.
export const waterRecycler = (opts = {}) =>
  item('water-recycler', opts, (s) => {
    s.rect({
      x: -30,
      y: -33,
      w: 60,
      h: 66,
      rx: 6,
      fill: s.lin([
        ['0', '#4a5560'],
        ['1', '#38424d'],
      ]),
    });
    s.border({ x: -30, y: -33, w: 60, h: 66, rx: 6, color: '#2b3742', width: 2 });
    s.rect({
      x: -17,
      y: -20,
      w: 34,
      h: 40,
      rx: 4,
      fill: s.lin([
        ['0', '#3a86a8'],
        ['1', '#2b6a88'],
      ]),
    });
    s.rect({ x: -13, y: -16, w: 26, h: 8, rx: 3, fill: 'rgba(255,255,255,.25)' });
  });

// 7 HYDROPONICS — wood tray with two lit green crop rows.
export const hydroponics = (opts = {}) =>
  item('hydroponics', opts, (s) => {
    s.rect({ x: -46, y: -24, w: 92, h: 48, rx: 5, fill: '#5a442c' });
    for (const dy of [-9, 9]) {
      s.glow(0, dy, 44, 'rgba(95,138,58,.45)', 1, 9);
      s.stripes({ x: -40, y: dy - 6, w: 80, h: 12, rx: 2, dir: 'v', band: 11, colors: ['#5f8a3a', '#4f7a30'] });
    }
  });

// 8 COOKER — dark range with two glowing hobs.
export const cooker = (opts = {}) =>
  item('cooker', opts, (s, { powered }) => {
    s.rect({
      x: -33,
      y: -26,
      w: 66,
      h: 52,
      rx: 6,
      fill: s.lin([
        ['0', '#39424c'],
        ['1', '#2a323b'],
      ]),
    });
    s.border({ x: -33, y: -26, w: 66, h: 52, rx: 6, color: '#1c242d', width: 2 });
    for (const dx of [-14, 16]) {
      s.glow(dx, 0, 22, 'rgba(232,134,60,.6)', powered ? 1 : 0.12);
      const hob = s.rad([
        [0, '#f2b563'],
        [0.6, '#e8863c'],
        [1, '#c14a32'],
      ]);
      s.circle({ cx: dx, cy: 0, r: 11, fill: powered ? hob : '#5a2f1c' });
    }
  });

// 9 COOLER — pale white fridge, cyan window, handle.
export const cooler = (opts = {}) =>
  item('cooler', opts, (s) => {
    s.rect({
      x: -26,
      y: -35,
      w: 52,
      h: 70,
      rx: 6,
      fill: s.lin([
        ['0', '#d8e2e8'],
        ['1', '#b8c6cf'],
      ]),
    });
    s.border({ x: -26, y: -35, w: 52, h: 70, rx: 6, color: '#8fa2ad', width: 3 });
    s.rect({
      x: -17,
      y: -23,
      w: 34,
      h: 26,
      rx: 3,
      fill: s.lin([
        ['0', '#7fb8d8'],
        ['1', '#5a9fd4'],
      ]),
    });
    s.rect({ x: -11, y: 17.5, w: 22, h: 5, rx: 2, fill: '#8fa2ad' });
  });

// 10 PASTE DISPENSER — steel column, cyan screen, tan spout.
export const pasteDispenser = (opts = {}) =>
  item('paste-dispenser', opts, (s) => {
    s.rect({
      x: -29,
      y: -32,
      w: 58,
      h: 64,
      rx: 6,
      fill: s.lin([
        ['0', '#4a5560'],
        ['1', '#38424d'],
      ]),
    });
    s.border({ x: -29, y: -32, w: 58, h: 64, rx: 6, color: '#2b3742', width: 2 });
    s.glow(0, -8, 20, 'rgba(90,200,220,.4)', 1, 9);
    s.rect({
      x: -15,
      y: -14,
      w: 30,
      h: 12,
      rx: 2,
      fill: s.lin([
        ['0', '#0e3a44'],
        ['1', '#0b2a32'],
      ]),
    });
    s.rect({ x: -20, y: 18, w: 40, h: 8, rx: 2, fill: '#c9b083' });
  });

// 11 DINING TABLE — warm-wood top with amber trim, two stools.
export const diningTable = (opts = {}) =>
  item('dining-table', opts, (s) => {
    s.rect({
      x: -39,
      y: -25,
      w: 78,
      h: 50,
      rx: 8,
      fill: s.lin([
        ['0', '#7a5334'],
        ['1', '#5f3f26'],
      ]),
    });
    s.rect({ x: -37, y: -23, w: 74, h: 3, rx: 1.5, fill: 'rgba(242,181,99,.35)' });
    s.circle({ cx: -52, cy: 0, r: 9, fill: '#4a3a28' });
    s.circle({ cx: 52, cy: 0, r: 9, fill: '#4a3a28' });
  });

// 12 BUNK BED — timber frame, red-striped mattress, cream pillow.
export const bunkBed = (opts = {}) =>
  item('bunk-bed', opts, (s) => {
    s.rect({ x: -28, y: -40, w: 56, h: 80, rx: 8, fill: '#8a6b4a' });
    s.stripes({ x: -24, y: -30, w: 48, h: 52, rx: 5, dir: 'v', band: 11, colors: ['#c14a32', '#b0402b'] });
    s.rect({ x: -20, y: -32, w: 40, h: 16, rx: 4, fill: '#eadfca' });
  });

// 13 DESK — wood surface, amber trim, corner terminal.
export const desk = (opts = {}) =>
  item('desk', opts, (s) => {
    s.rect({
      x: -44,
      y: -22,
      w: 88,
      h: 44,
      rx: 5,
      fill: s.lin([
        ['0', '#7a5c38'],
        ['1', '#5f4527'],
      ]),
    });
    s.rect({ x: -42, y: -20, w: 84, h: 3, rx: 1.5, fill: 'rgba(242,181,99,.35)' });
    s.glow(20, -16, 20, 'rgba(90,200,220,.4)', 1, 12);
    s.rect({
      x: 5,
      y: -25,
      w: 30,
      h: 18,
      rx: 3,
      fill: s.lin([
        ['0', '#0e3a44'],
        ['1', '#0b2a32'],
      ]),
    });
  });

// 14 CHAIR — dark seat + a lighter back rail.
export const chair = (opts = {}) =>
  item('chair', opts, (s) => {
    s.rect({ x: -22, y: -22, w: 44, h: 44, rx: 8, fill: '#4a3a28' });
    s.rect({ x: -22, y: -29, w: 44, h: 14, rx: 6, fill: '#5f4a30' });
  });

// 15 LOCKER — twin steel doors, seam, amber handle.
export const locker = (opts = {}) =>
  item('locker', opts, (s) => {
    s.rect({
      x: -26,
      y: -40,
      w: 52,
      h: 80,
      rx: 5,
      fill: s.lin(
        [
          ['0', '#4a5560'],
          ['1', '#3a434d'],
        ],
        'h',
      ),
    });
    s.border({ x: -26, y: -40, w: 52, h: 80, rx: 5, color: '#2b3742', width: 2 });
    s.rect({ x: -1, y: -40, w: 2, h: 80, fill: 'rgba(0,0,0,.45)' });
    s.rect({ x: -10.5, y: -6, w: 5, h: 12, rx: 2, fill: '#f2b563' });
  });

// 16 RUG — red woven field with a cream border + dashed inset.
export const rug = (opts = {}) =>
  item('rug', opts, (s) => {
    s.stripes({ x: -48, y: -32, w: 96, h: 64, rx: 8, dir: 'v', band: 14, colors: ['#b34a34', '#a4402d'] });
    s.border({ x: -48, y: -32, w: 96, h: 64, rx: 8, color: '#d9b48a', width: 5 });
    s.rect({
      x: -30,
      y: -17,
      w: 60,
      h: 34,
      rx: 5,
      fill: 'none',
      stroke: 'rgba(217,180,138,.7)',
      sw: 2,
    });
    s.raw(
      '<rect x="-30" y="-17" width="60" height="34" rx="5" fill="none" stroke="rgba(217,180,138,.7)" stroke-width="2" stroke-dasharray="6 5"/>',
    );
  });

// 17 STANDING LAMP — warm glowing head on a slim pole + base.
export const standingLamp = (opts = {}) =>
  item('standing-lamp', opts, (s, { powered }) => {
    s.rect({ x: -3, y: -2, w: 6, h: 44, fill: '#4a3a28' });
    s.rect({ x: -13, y: 39, w: 26, h: 6, rx: 3, fill: '#4a3a28' });
    s.glow(0, -18, 40, 'rgba(232,134,60,.5)', powered ? 1 : 0.1);
    const head = s.rad([
      [0, '#f2b563'],
      [1, '#e8863c'],
    ]);
    s.circle({ cx: 0, cy: -18, r: 22, fill: powered ? head : '#6b4a26' });
  });

// 18 POTTED PLANT — leafy green crown over a tapered pot.
export const pottedPlant = (opts = {}) =>
  item('potted-plant', opts, (s) => {
    s.path(roundedRectPath(-17, 16, 34, 28, { bl: 10, br: 10 }), {
      fill: s.lin([
        ['0', '#8a5a38'],
        ['1', '#6b4527'],
      ]),
    });
    s.glow(0, -10, 34, 'rgba(95,138,58,.35)');
    s.circle({
      cx: 0,
      cy: -10,
      r: 29,
      fill: s.rad(
        [
          [0, '#6f9c48'],
          [1, '#3f6b2a'],
        ],
        { cx: 0.45, cy: 0.4 },
      ),
    });
  });

// 19 BOOKSHELF — timber case with two rows of colourful spines.
export const bookshelf = (opts = {}) =>
  item('bookshelf', opts, (s) => {
    s.rect({ x: -40, y: -33, w: 80, h: 66, rx: 5, fill: '#5a442c' });
    s.border({ x: -40, y: -33, w: 80, h: 66, rx: 5, color: '#4a3822', width: 3 });
    const rowTop = [
      ['#c14a32', 22],
      ['#5aa77f', 26],
      ['#e8934a', 20],
      ['#5a9fd4', 24],
      ['#c9b083', 22],
      ['#b5652a', 26],
    ];
    const rowBot = [
      ['#8fbf6a', 24],
      ['#e07a5f', 20],
      ['#7fb0d8', 26],
      ['#f2b563', 22],
      ['#b34a34', 24],
      ['#5f8a3a', 20],
    ];
    const drawRow = (row, cy) => {
      const gap = 3;
      const total = row.length * 8 + (row.length - 1) * gap;
      let bx = -total / 2;
      for (const [color, bh] of row) {
        s.rect({ x: bx, y: cy - bh / 2, w: 8, h: bh, fill: color });
        bx += 8 + gap;
      }
    };
    drawRow(rowTop, -14);
    drawRow(rowBot, 14);
  });

// 20 MED BED — cream clinical bed, pillow, red cross.
export const medBed = (opts = {}) =>
  item('med-bed', opts, (s) => {
    s.rect({ x: -26, y: -39, w: 52, h: 78, rx: 6, fill: '#c9b083' });
    s.border({ x: -26, y: -39, w: 52, h: 78, rx: 6, color: '#b39a6a', width: 3 });
    s.rect({ x: -18, y: -33, w: 36, h: 14, rx: 4, fill: '#eadfca' });
    s.rect({ x: -11, y: 3.5, w: 22, h: 5, fill: '#c14a32' });
    s.rect({ x: -2.5, y: -5, w: 5, h: 22, fill: '#c14a32' });
  });

// 21 RESEARCH CONSOLE — dark desk, big cyan display, keyboard.
export const researchConsole = (opts = {}) =>
  item('research-console', opts, (s) => {
    s.rect({
      x: -40,
      y: -26,
      w: 80,
      h: 52,
      rx: 6,
      fill: s.lin([
        ['0', '#333d47'],
        ['1', '#232b33'],
      ]),
    });
    s.glow(0, -8, 40, 'rgba(90,200,220,.5)', 1, 16);
    s.rect({
      x: -33,
      y: -21,
      w: 66,
      h: 26,
      rx: 3,
      fill: s.lin([
        ['0', '#0e3a44'],
        ['1', '#0b2a32'],
      ]),
    });
    s.rect({ x: -33, y: 14, w: 66, h: 8, rx: 2, fill: '#2b3742' });
  });

// 22 COMMS DISH — tan parabola on a mast + base (native SVG in the mock).
export const commsDish = (opts = {}) =>
  item('comms-dish', opts, (s) => {
    // mock viewBox 0..90, centre (45,45): subtract 45 from every coord.
    s.path('M-33,-25 A40,40 0 0 1 25,-5 L0,7 Z', { fill: '#c9b083', stroke: '#8fa2ad', sw: 2 });
    s.line({ x1: 0, y1: 7, x2: 7, y2: 37, stroke: '#3a4b5c', sw: 6, cap: 'round' });
    s.circle({ cx: 0, cy: 7, r: 5, fill: '#e8934a' });
    s.rect({ x: -7, y: 35, w: 28, h: 7, rx: 3, fill: '#3a4b5c' });
  });

// 23 SENSOR ARRAY — concentric rings + a cyan sweep wedge (native SVG).
export const sensorArray = (opts = {}) =>
  item('sensor-array', opts, (s) => {
    // mock viewBox 0..88, centre (44,44).
    for (const r of [36, 24, 12]) s.circle({ cx: 0, cy: 0, r, fill: 'none', stroke: '#3a4b5c', sw: 2 });
    s.path('M0,0 L0,-36 A36,36 0 0 1 30,-14 Z', { fill: 'rgba(90,200,220,.25)' });
    s.line({ x1: 0, y1: 0, x2: 30, y2: -14, stroke: '#5ac8dc', sw: 2 });
    s.glow(18, -18, 10, 'rgba(232,147,74,.6)');
    s.circle({ cx: 18, cy: -18, r: 3.5, fill: '#e8934a' });
  });

// 24 WORKBENCH — dark-wood bench, a hot tool glow + a steel tool.
export const workbench = (opts = {}) =>
  item('workbench', opts, (s, { powered }) => {
    s.rect({
      x: -46,
      y: -24,
      w: 92,
      h: 48,
      rx: 5,
      fill: s.lin([
        ['0', '#4a3a28'],
        ['1', '#33281b'],
      ]),
    });
    s.rect({ x: -44, y: -22, w: 88, h: 3, rx: 1.5, fill: 'rgba(242,181,99,.3)' });
    s.glow(-22, 0, 24, 'rgba(232,134,60,.55)', powered ? 1 : 0.15);
    s.circle({
      cx: -22,
      cy: 0,
      r: 12,
      fill: powered
        ? s.rad([
            [0, '#f2b563'],
            [1, '#e8863c'],
          ])
        : '#6b4a26',
    });
    s.rect({ x: 7, y: -6, w: 30, h: 8, rx: 2, fill: '#8fa2ad' });
  });

// 25 FABRICATOR — steel cabinet with a molten print chamber.
export const fabricator = (opts = {}) =>
  item('fabricator', opts, (s, { powered }) => {
    s.rect({
      x: -35,
      y: -32,
      w: 70,
      h: 64,
      rx: 6,
      fill: s.lin([
        ['0', '#4a5560'],
        ['1', '#38424d'],
      ]),
    });
    s.border({ x: -35, y: -32, w: 70, h: 64, rx: 6, color: '#2b3742', width: 2 });
    s.rect({ x: -8, y: -28, w: 16, h: 12, fill: '#2b3742' });
    s.glow(0, 4, 28, 'rgba(232,134,60,.55)', powered ? 1 : 0.12, 18);
    s.rect({
      x: -19,
      y: -8,
      w: 38,
      h: 24,
      rx: 4,
      fill: powered
        ? s.rad([
            [0, '#f2b563'],
            [0.6, '#e8863c'],
            [1, '#8a3a1f'],
          ])
        : '#5a2f1c',
    });
  });

// 26 STORAGE CRATE — banded timber crate with cross straps.
export const storageCrate = (opts = {}) =>
  item('storage-crate', opts, (s) => {
    s.rect({
      x: -32,
      y: -30,
      w: 64,
      h: 60,
      rx: 5,
      fill: s.lin([
        ['0', '#7a5c38'],
        ['1', '#5f4527'],
      ]),
    });
    s.border({ x: -32, y: -30, w: 64, h: 60, rx: 5, color: '#4a3822', width: 2 });
    s.rect({ x: -32, y: -4.5, w: 64, h: 9, fill: '#4a3822' });
    s.rect({ x: -4.5, y: -30, w: 9, h: 60, fill: '#4a3822' });
  });

// 27 BLAST DOOR — reinforced steel with a seam + two hazard bands.
export const blastDoor = (opts = {}) =>
  item('blast-door', opts, (s) => {
    s.rect({
      x: -39,
      y: -35,
      w: 78,
      h: 70,
      rx: 4,
      fill: s.lin([
        ['0', '#4a5560'],
        ['1', '#38424d'],
      ]),
    });
    s.border({ x: -39, y: -35, w: 78, h: 70, rx: 4, color: '#2b3742', width: 3 });
    s.rect({ x: -4, y: -35, w: 8, h: 70, fill: '#1c242d' });
    const hz = s.pat('<rect width="16" height="16" fill="#2b241c"/><rect width="8" height="16" fill="#e8934a"/>', {
      w: 16,
      h: 16,
      transform: 'rotate(45)',
    });
    s.rect({ x: -39, y: -29, w: 78, h: 10, fill: hz });
    s.rect({ x: -39, y: 19, w: 78, h: 10, fill: hz });
  });

// 28 TURRET — swivel base, dome, barrel, glowing muzzle.
export const turret = (opts = {}) =>
  item('turret', opts, (s, { powered }) => {
    s.rect({
      x: -24,
      y: 5,
      w: 48,
      h: 26,
      rx: 8,
      fill: s.lin([
        ['0', '#4a5560'],
        ['1', '#38424d'],
      ]),
    });
    s.border({ x: -24, y: 5, w: 48, h: 26, rx: 8, color: '#2b3742', width: 2 });
    s.circle({ cx: 0, cy: -4, r: 15, fill: '#3a4b5c' });
    s.circle({ cx: 0, cy: -4, r: 13.5, fill: 'none', stroke: '#2b3742', sw: 3 });
    s.rect({ x: -4.5, y: -47, w: 9, h: 34, rx: 3, fill: '#2b3742' });
    s.glow(0, -44, 10, 'rgba(232,134,60,.6)', powered ? 1 : 0.15);
    s.circle({ cx: 0, cy: -44, r: 4.5, fill: powered ? '#e8863c' : '#5a2f1c' });
  });

// 29 CRYOPOD — steel capsule with a frosted cyan window.
export const cryopod = (opts = {}) =>
  item('cryopod', opts, (s) => {
    s.rect({
      x: -24,
      y: -41,
      w: 48,
      h: 82,
      rx: 24,
      fill: s.lin(
        [
          ['0', '#4a5560'],
          ['1', '#38424d'],
        ],
        'h',
      ),
    });
    s.border({ x: -24, y: -41, w: 48, h: 82, rx: 24, color: '#2b3742', width: 3 });
    s.rect({
      x: -15,
      y: -31,
      w: 30,
      h: 62,
      rx: 15,
      fill: s.lin([
        ['0', '#7fb8d8'],
        ['0.6', '#5a9fd4'],
        ['1', '#3a86a8'],
      ]),
    });
    s.rect({ x: -11, y: -27, w: 22, h: 20, rx: 10, fill: 'rgba(255,255,255,.35)' });
  });

// 30 FUEL DRUM — copper barrel, hazard band, base shadow.
export const fuelDrum = (opts = {}) =>
  item('fuel-drum', opts, (s) => {
    s.rect({
      x: -24,
      y: -32,
      w: 48,
      h: 64,
      rx: 8,
      fill: s.lin(
        [
          ['0', '#c8935a'],
          ['0.55', '#a8763f'],
          ['1', '#8a5f30'],
        ],
        'h',
      ),
    });
    s.border({ x: -24, y: -32, w: 48, h: 64, rx: 8, color: '#6b4a26', width: 2 });
    s.rect({
      x: -24,
      y: -14,
      w: 48,
      h: 12,
      fill: s.pat('<rect width="14" height="12" fill="#2b241c"/><rect width="7" height="12" fill="#e8934a"/>', {
        w: 14,
        h: 12,
        transform: 'rotate(45)',
      }),
    });
    s.rect({ x: -24, y: 14, w: 48, h: 4, fill: 'rgba(0,0,0,.3)' });
  });
