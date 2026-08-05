// The OBJECT builders (structures & furniture) of the warm item set. Each is a pure
// `(opts) -> string` SVG-`<g>`-fragment builder; geometry + colour are translated verbatim from
// docs/design/perilune-item-set.dc.html (element numbers 1–30). Authored in centred mock-px space;
// see helpers.js for the coordinate/normalisation model. `opts.state:'off'` dims a lit device's glow.
//
// ⚠️ IT WAS 30 AND IS NOW 14, AND THE HEADLINE THAT SAID "30" IS CORRECTED RATHER THAN LEFT.
// VR-P2 (the visual redesign's fittings package) RETIRED sixteen of them — `battery-bank`,
// `o2-scrubber`, `hydroponics`, `cooker`, `cooler`, `dining-table`, `bunk-bed`, `desk`, `chair`,
// `locker`, `rug`, `standing-lamp`, `research-console`, `workbench`, `storage-crate`, `fuel-drum` —
// because the owner's `design-import/Perilune Fittings.dc.html` draws every one of them and the
// registry rows now point at `client/src/items/fittings.js`. The ROWS did not move: same id, same
// class, same glyph, new drawing. What is gone is the warm-set painting, and it is gone rather than
// merely unreferenced because a dead builder beside a live one is how the next art lane restyles the
// wrong file. `git log` has them; `docs/design/perilune-item-set.dc.html` still specifies them.
//
// Everything still here is a row the fittings catalogue does NOT cover, and it keeps its warm-set
// art until the follow-up package (charter §3, filed as P2b) gives the remaining rows the paper
// idiom too. The set is deliberately mid-migration and says so.

import { item, roundedRectPath } from './helpers.js';

// 1 REACTOR — REDRAWN 2026-07-27 (mock re-import; owner: "the current ones were difficult to
// understand"). The old piece was a bare glowing disc — indistinguishable from a lamp, a hob or a
// standing light at tile size. It is now a machine: an armoured housing, coolant fins down each
// flank, a dashed containment ring round the core, and a control strip whose four lamps read three
// lit and one dark. The core is the same ember radial; what changed is everything AROUND it, which
// is what the eye uses to tell one glowing circle from another.
export const reactor = (opts = {}) =>
  item('reactor', opts, (s, { powered }) => {
    // coolant fins FIRST, so the housing's own border draws clean over their inner edge
    for (const dx of [-47, 33]) {
      s.rect({
        x: dx, y: -32, w: 14, h: 64, rx: 5,
        fill: s.lin([['0', '#5a6672'], ['1', '#38424d']], 'h'),
      });
      s.border({ x: dx, y: -32, w: 14, h: 64, rx: 5, color: '#2b3742', width: 1 });
    }
    s.rect({ x: -48, y: -44, w: 96, h: 88, rx: 8, fill: s.lin([['0', '#4a5560'], ['1', '#333d47']]) });
    s.border({ x: -48, y: -44, w: 96, h: 88, rx: 8, color: '#2b3742', width: 3 });
    // containment ring — dashed, so `raw` rather than `circle` (the helper carries no dash term)
    s.raw('<circle cx="0" cy="-4" r="34" fill="none" stroke="rgba(242,181,99,.45)" '
      + 'stroke-width="2" stroke-dasharray="6 5"/>');
    s.glow(0, -4, 40, 'rgba(232,134,60,.55)', powered ? 1 : 0.15);
    const core = s.rad(
      [[0, '#ffe6b0'], [0.45, '#e8863c'], [1, '#8a3a1f']],
      { cx: 0.5, cy: 0.4 },
    );
    s.circle({ cx: 0, cy: -4, r: 26, fill: powered ? core : '#8a3a1f' });
    s.circle({ cx: 0, cy: -4, r: 24, fill: 'none', stroke: '#2b3742', sw: 4 });
    // control strip: four lamps, three lit — a running plant, not a decorative light
    s.rect({ x: -33, y: 28, w: 66, h: 12, rx: 2, fill: s.lin([['0', '#3a2a10'], ['1', '#2a1e0c']]) });
    s.border({ x: -33, y: 28, w: 66, h: 12, rx: 2, color: '#cf7a33', width: 1 });
    let lx = -18.5;
    for (const c of ['#f2b563', '#f2b563', '#f2b563', '#5a4426']) {
      s.rect({ x: lx, y: 31.5, w: 7, h: 5, fill: powered ? c : '#5a4426' });
      lx += 10;
    }
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
// 5 OXYGEN TANK — REDRAWN. One capsule with a nub on top was a cryopod, a barrel or a battery. It is
// now the mock's TWIN BOTTLE SET: two cylinders yoked at the neck and strapped at the base, each with
// a valve cap and a white label patch. A pair of bottles in a cradle is a gas store and nothing else.
export const oxygenTank = (opts = {}) =>
  item('oxygen-tank', opts, (s) => {
    s.rect({ x: -26, y: -49, w: 52, h: 6, rx: 3, fill: '#5a6672' });   // the yoke across both necks
    for (const dx of [-37, 1]) {
      s.rect({ x: dx + 11, y: -46, w: 14, h: 12, rx: 3, fill: '#8fa2ad' });   // valve cap
      s.rect({
        x: dx, y: -34, w: 36, h: 72, rx: 18,
        fill: s.lin([['0', '#7fc0e8'], ['0.55', '#3d7fb0'], ['1', '#276086']], 'h'),
      });
      s.border({ x: dx, y: -34, w: 36, h: 72, rx: 18, color: '#274f61', width: 3 });
      s.rect({ x: dx + 5, y: -16, w: 26, h: 16, rx: 3, fill: 'rgba(255,255,255,.9)' });  // label patch
    }
    s.rect({ x: -40, y: 23.5, w: 80, h: 9, rx: 3, fill: '#4a5560' });        // the base strap
    s.border({ x: -40, y: 23.5, w: 80, h: 9, rx: 3, color: '#2b3742', width: 1 });
  });

// 6 WATER RECYCLER — REDRAWN. A steel box with a teal window is a screen, a viewport or a fridge.
// The redraw gives it the three things that make it a RECYCLER: a filled sight-glass with a water
// LINE across it, a dirty inlet high on one side and a lit clean outlet low on the other (the flow
// direction IS the machine), and the recycling mark.
//
// ⚠️ THE TEXT RULE FOR THIS WHOLE FILE, decided with the 2026-07-27 redraw and applied consistently:
// a glyph from the mock is kept only where its authored size is ≥ 15 mock-px. Below that it renders
// as a smudge at the size a tile is actually drawn and costs more than it tells. Kept: this ♲ (17)
// and COOLER's ❄ (17). Dropped: O₂ SCRUBBER's `CO₂` (8), OXYGEN TANK's `O₂` (11), COOLER's `-18°`
// (9), HATCH's `▼` (8) — the last replaced by a drawn triangle, which scales.
export const waterRecycler = (opts = {}) =>
  item('water-recycler', opts, (s, { powered }) => {
    s.rect({ x: -32, y: -35, w: 64, h: 70, rx: 6, fill: s.lin([['0', '#4a5560'], ['1', '#38424d']]) });
    s.border({ x: -32, y: -35, w: 64, h: 70, rx: 6, color: '#2b3742', width: 2 });
    s.rect({ x: -21, y: -15, w: 42, h: 38, rx: 4, fill: s.lin([['0', '#3a86a8'], ['1', '#2b6a88']]) });
    s.rect({ x: -21, y: -13, w: 42, h: 10, fill: 'rgba(127,196,221,.55)' });   // the water line
    s.rect({ x: -49, y: -26.5, w: 22, h: 9, rx: 4, fill: '#6b5a3e' });         // grey water IN
    s.glow(38, 26, 14, 'rgba(90,159,212,.5)', powered ? 1 : 0.15);
    s.rect({ x: 27, y: 21.5, w: 22, h: 9, rx: 4, fill: '#5a9fd4' });           // clean water OUT
    s.text('♻', { x: 0, y: 4, size: 22, weight: 700, fill: 'rgba(255,255,255,.85)' });
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
// 25 FABRICATOR — REDRAWN. The old piece was a steel box with a hot rectangle inside it, which at
// tile size is the cooker seen from a different angle. It is now a printer you can watch WORKING: a
// dark chamber you look into, a bright print head sweeping across the top of it, a billet forming
// underneath, an output tray at the bottom lip and a green ready-lamp in the corner.
export const fabricator = (opts = {}) =>
  item('fabricator', opts, (s, { powered }) => {
    s.rect({ x: -39, y: -36, w: 78, h: 72, rx: 6, fill: s.lin([['0', '#4a5560'], ['1', '#38424d']]) });
    s.border({ x: -39, y: -36, w: 78, h: 72, rx: 6, color: '#2b3742', width: 3 });
    s.rect({ x: -29, y: -25, w: 58, h: 38, rx: 3, fill: s.lin([['0', '#101820'], ['1', '#0a1016']]) });
    s.glow(0, -18, 30, 'rgba(242,181,99,.7)', powered ? 1 : 0.1, 8);
    s.rect({ x: -29, y: -20.5, w: 58, h: 5, fill: powered ? '#f2b563' : '#5a4426' });   // print head
    s.glow(0, 2, 20, 'rgba(232,147,74,.4)', powered ? 1 : 0.12);
    s.rect({
      x: -13, y: -8, w: 26, h: 20, rx: 2,
      fill: powered ? s.lin([['0', '#e8934a'], ['1', '#b5652a']]) : '#5a2f1c',
    });
    s.rect({ x: -29, y: 19.5, w: 58, h: 9, rx: 2, fill: '#2b3742' });                   // output tray
    s.border({ x: -29, y: 19.5, w: 58, h: 9, rx: 2, color: '#1c242d', width: 1 });
    s.glow(-30, -30, 10, 'rgba(90,167,127,.6)', powered ? 1 : 0.15);
    s.circle({ cx: -30, cy: -30, r: 4, fill: powered ? '#5aa77f' : '#2f4f3f' });
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
