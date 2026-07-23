// The 12 MATERIAL builders — 6 walls (#31–36) + 6 floors (#37–42). Each renders the mock's
// 106×94 swatch: a rounded tile with its base tint + material pattern (and, for walls, the amber
// top trim-light). Pure `(opts) -> string`; geometry/colour verbatim from perilune-item-set.dc.html.

import { item } from './helpers.js';

const SW = 106; // swatch width
const SH = 94; //  swatch height
const X0 = -SW / 2;
const Y0 = -SH / 2;

/** dot pattern: a dark dot on a size×size cell (radial-gradient dots in the mock). */
const dots = (s, color, size, r = 1.5) =>
  s.pat(`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}"/>`, { w: size, h: size });

/** grid pattern: thin top + left line on a size×size cell (linear-gradient grid). */
const grid = (s, color, size, lw = 1) =>
  s.pat(`<rect width="${size}" height="${lw}" fill="${color}"/><rect width="${lw}" height="${size}" fill="${color}"/>`, {
    w: size,
    h: size,
  });

// 31 STEEL BULKHEAD — navy body, amber top trim, rivet dots.
export const steelBulkhead = (opts = {}) =>
  item('steel-bulkhead', opts, (s) => {
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 6, fill: '#3a4b5c' });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 6, fill: dots(s, 'rgba(0,0,0,.35)', 20) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 6, color: '#2b3742', width: 2 });
    s.rect({ x: X0, y: Y0, w: SW, h: 5, fill: 'rgba(232,147,74,.5)' });
  });

// 32 TIMBER-LINED WALL — horizontal warm-wood planks.
export const timberLinedWall = (opts = {}) =>
  item('timber-lined-wall', opts, (s) => {
    s.stripes({ x: X0, y: Y0, w: SW, h: SH, rx: 6, dir: 'h', band: 15, colors: ['#8a5e38', '#7a5230'] });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 6, color: '#5f3f26', width: 4 });
  });

// 33 BLAST WALL — dark reinforced body, big dots, amber hazard band.
export const blastWall = (opts = {}) =>
  item('blast-wall', opts, (s) => {
    s.rect({
      x: X0,
      y: Y0,
      w: SW,
      h: SH,
      rx: 6,
      fill: s.lin([
        ['0', '#2b3742'],
        ['1', '#232c34'],
      ]),
    });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 6, fill: dots(s, 'rgba(0,0,0,.45)', 26, 2) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 6, color: '#4a5560', width: 4 });
    s.rect({
      x: X0,
      y: -3,
      w: SW,
      h: 14,
      fill: s.pat('<rect width="18" height="18" fill="#2b241c"/><rect width="9" height="18" fill="#e8934a"/>', {
        w: 18,
        h: 18,
        transform: 'rotate(45)',
      }),
    });
  });

// 34 GLASS PARTITION — translucent cyan pane, steel frame, inner sheen.
export const glassPartition = (opts = {}) =>
  item('glass-partition', opts, (s) => {
    s.rect({
      x: X0,
      y: Y0,
      w: SW,
      h: SH,
      rx: 6,
      fill: s.lin(
        [
          ['0', 'rgba(90,200,220,.28)'],
          ['1', 'rgba(90,159,212,.12)'],
        ],
        'diag',
      ),
    });
    s.rect({ x: X0 + 20, y: Y0 + 16, w: SW - 40, h: SH - 32, rx: 4, fill: 'rgba(255,255,255,.14)' });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 6, color: '#4a5560', width: 5 });
  });

// 35 INSULATED WALL — mid steel body, fine grid, inset frame.
export const insulatedWall = (opts = {}) =>
  item('insulated-wall', opts, (s) => {
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 6, fill: '#4a5560' });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 6, fill: grid(s, 'rgba(0,0,0,.18)', 24, 2) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 6, color: '#38424d', width: 3 });
  });

// 36 HULL PLATING — darkest steel, vertical seams + rivet dots.
export const hullPlating = (opts = {}) =>
  item('hull-plating', opts, (s) => {
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 6, fill: '#28323d' });
    s.rect({
      x: X0,
      y: Y0,
      w: SW,
      h: SH,
      rx: 6,
      fill: s.pat('<rect width="35" height="20" fill="none"/><rect width="2" height="20" fill="rgba(0,0,0,.3)"/>', {
        w: 35,
        h: 20,
      }),
    });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 6, fill: dots(s, 'rgba(0,0,0,.35)', 20) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 6, color: '#1c242d', width: 2 });
  });

// ── FLOORS ──

// 37 STEEL-TAN FLOOR — the default deck, fine dark grid.
export const steelTanFloor = (opts = {}) =>
  item('steel-tan-floor', opts, (s) => {
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: '#9c8763' });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: grid(s, 'rgba(0,0,0,.16)', 22, 1) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 5, color: 'rgba(0,0,0,.25)', width: 1 });
  });

// 38 WOOD PLANK FLOOR — warm vertical planks.
export const woodPlankFloor = (opts = {}) =>
  item('wood-plank-floor', opts, (s) => {
    s.stripes({ x: X0, y: Y0, w: SW, h: SH, rx: 5, dir: 'v', band: 21, colors: ['#c2894e', '#b57e45'] });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 5, color: 'rgba(0,0,0,.22)', width: 1 });
  });

// 39 GROW MATTING — olive mat, soft green dots.
export const growMatting = (opts = {}) =>
  item('grow-matting', opts, (s) => {
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: '#8a9857' });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: dots(s, 'rgba(60,90,40,.55)', 15, 2) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 5, color: 'rgba(0,0,0,.22)', width: 1 });
  });

// 40 CREAM TILE FLOOR — medbay cream, faint tile grid.
export const creamTileFloor = (opts = {}) =>
  item('cream-tile-floor', opts, (s) => {
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: '#d8c39c' });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: grid(s, 'rgba(0,0,0,.1)', 26, 1) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 5, color: 'rgba(0,0,0,.18)', width: 1 });
  });

// 41 METAL GRATING — dark grating slats + rivet dots.
export const metalGrating = (opts = {}) =>
  item('metal-grating', opts, (s) => {
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: '#6e6656' });
    s.rect({
      x: X0,
      y: Y0,
      w: SW,
      h: SH,
      rx: 5,
      fill: s.pat('<rect width="9" height="9" fill="none"/><rect width="9" height="2" fill="rgba(0,0,0,.3)"/>', {
        w: 9,
        h: 9,
      }),
    });
    s.rect({ x: X0, y: Y0, w: SW, h: SH, rx: 5, fill: dots(s, 'rgba(0,0,0,.4)', 18, 1.5) });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 5, color: 'rgba(0,0,0,.3)', width: 1 });
  });

// 42 CARPET FLOOR — red woven field with a cream border (= rug field).
export const carpetFloor = (opts = {}) =>
  item('carpet-floor', opts, (s) => {
    s.stripes({ x: X0, y: Y0, w: SW, h: SH, rx: 5, dir: 'v', band: 11, colors: ['#b34a34', '#a4402d'] });
    s.border({ x: X0, y: Y0, w: SW, h: SH, rx: 5, color: '#d9b48a', width: 5 });
  });
