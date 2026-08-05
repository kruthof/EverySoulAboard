// THE CABINET-OBLIQUE KIT — the one place the visual redesign's projection lives.
//
// A PURE string module: no DOM, no clock, no randomness, no locale API. Same input ⇒ byte-identical
// output. Every builder returns an SVG FRAGMENT (elements, never a whole <svg>), so a surface can
// compose plate + room + fittings into ONE document with ONE `<defs>`.
//
// Authority: `docs/design/perilune-visual-redesign.charter.md` §1, measured off the owner's two
// design documents. Where a value was measured rather than quoted, the element it came from is
// named inline so the next reader can re-measure instead of trusting this comment.
//
// ── THE PROJECTION (measured, exact) ──────────────────────────────────────────────────────────
// Cabinet oblique at scale `s` px/cm. A point `d` cm BEHIND the picture plane moves
//
//       (+0.4·s·d , −0.6·s·d)
//
// and nothing else changes: x is x, height is height. That is why `depth()` is two multiplications
// and not a matrix — the whole dialect is one vector, shared by the room cutaway, the thirty
// fittings and the plate miniatures, so a fitting drawn for the catalogue drops into a room at a
// different `s` and still lines up. ROUND THINGS DRAW LEVEL (ellipses, no heading) — a round fitting
// has no front, so it can be set down any way about; that rule lives in the fitting builders (P2),
// not here, but it is the reason this module has no `rotate`.
//
//   s = 1.00  the ship plate      (PX_PER_CM.plate)
//   s = 0.95  the room cutaway    (PX_PER_CM.room)       — 1 m = 95 px
//   s = 0.85  the fittings sheet  (PX_PER_CM.catalogue)  — the catalogue's own cm rule
//
// VERIFIED against the design markup, not derived: the galley cutaway's floor quad reads
// `M58 452 L875 452 L981.4 292.4 L164.4 292.4 Z`, i.e. a 2.8 m depth at s=0.95 displaces
// (+106.4, −159.6) — which is exactly `depth(280, 0.95)`. `room(8.6, 2.8, 2.4, 0.95)` reproduces
// that quad, both walls and every grid line of the design's own drawing.
//
// ── ROUNDING ──────────────────────────────────────────────────────────────────────────────────
// `n()` is `overview-scene.js:81` verbatim — 2 decimal places, −0 normalised to 0. NEVER
// `toLocaleString`, never `Intl`: this dev box is de-DE and a locale-formatted "79,28" is a broken
// path attribute that fails silently at render time rather than loudly at build time. Plain
// arithmetic + `Math.round` only. The design documents themselves round to 1 dp, so this kit's
// output is the same geometry at higher precision — e.g. the doc's `79.3 420.1` is our
// `79.28 420.08`. That is deliberate: the charter fixes the rounding rule, not the doc's digits.

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** px per cm at each of the three drawing scales (charter §1, measured). */
export const PX_PER_CM = Object.freeze({ plate: 1.0, room: 0.95, catalogue: 0.85 });

/** The oblique's two ratios. `depth()` is the only thing that should ever read them. */
export const DEPTH_RATIO = Object.freeze({ x: 0.4, y: -0.6 });

/** The ink, the paper and the one accent — duplicated as literals to keep this module dependency
 *  free at the seam P2–P6 import it from. They are the same strings as `theme/paper-tokens.js`
 *  (`INK.ink`, `PAPER.plate`, `PAPER.inset3`, `ATTEND`, `HALO`), and `oblique.test.js` pins the
 *  agreement so the two copies cannot drift. */
export const INK = '#14120F';
export const PAPER = '#EBE4D1';
export const PAPER_FLAT = '#E1D9C5';
export const ATTEND = '#7B2C22';

/** The `#fh` hatch, measured verbatim off `<pattern id="fh">` in BOTH design documents. */
export const HATCH = Object.freeze({ period: 7, angle: 45, ink: INK, ground: PAPER, width: 0.7, opacity: 0.28 });

/** Halo text (charter §1) and the two-pass figure knockout (measured: ink width + 3.0). */
export const HALO = Object.freeze({ stroke: PAPER, width: 3.4, paintOrder: 'stroke' });
export const GHOST = Object.freeze({ knockout: PAPER, widen: 3.0 });

/**
 * The two type stacks, byte-identical to what the DOM resolves (`--font-serif` / `--font-mono` in
 * `styles/base.css`, mirrored by `theme/paper-tokens.js`'s `TYPE`) — duplicated as literals for the
 * same reason the colours are, and pinned against `TYPE` by `oblique.test.js`.
 *
 * ⚠️ THE DESIGN MARKUP IS THE SHORTER STRING AND IT IS NOT THE ONE TO COPY. The documents write
 * `font-family="'Instrument Serif', serif"`, because a `.dc.html` page has the webfont or it does
 * not. Here an SVG label sits BESIDE DOM text in the same window, so a divergent fallback chain
 * means the two disagree about what to draw the moment the webfont is missing or still loading —
 * a de-DE box picking a different system serif for the SVG than for the HTML beside it. Same stack,
 * same fallback, same advances.
 */
export const FONT = Object.freeze({
  serif: "'Instrument Serif',ui-serif,Georgia,serif",
  mono:  "'Space Mono', ui-monospace, 'SF Mono', Menlo, monospace",
});

/** The room cutaway's default drawing weights, measured on the galley plate. */
export const ROOM_WEIGHT = Object.freeze({
  wall: 2.2, floor: 1.4, edge: 2.2, cut: 1.1, cutDash: '7 5', grid: 0.5, gridOpacity: 0.2,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Tiny deterministic string helpers (no locale APIs, InvariantCulture-safe)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Round to 2 dp and normalise −0 → 0. Identical in behaviour to `ui/overview-scene.js:81 n(v)`. */
export function n(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }

/** XML-escape a text node / attribute value. */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** ` name="value"`, or '' when the value is null/undefined. Numbers go through `n()`. */
function attr(name, val) {
  if (val == null) return '';
  return ` ${name}="${typeof val === 'number' ? n(val) : esc(val)}"`;
}

/** `M x y L x y …` from a list of [x,y] pairs; `close` appends `Z`. */
export function poly(points, close = true) {
  const parts = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`);
  return parts.join(' ') + (close ? ' Z' : '');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The projection
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The oblique displacement of a point `dCm` centimetres behind the picture plane, at scale `s`.
 * Returns `[dx, dy]` in px, ROUNDED like every other number this module emits.
 *   depth(280, 0.95) → [106.4, -159.6]   (the galley cutaway's 2.8 m depth — the measured anchor)
 *   depth(100, 0.85) → [34, -51]         (the catalogue's per-metre displacement)
 * A non-finite depth or scale reads as 0 rather than throwing — a NaN here would silently poison a
 * whole path string with "NaN" and draw nothing.
 * @param {number} dCm depth in centimetres (positive = away from the viewer)
 * @param {number} s px per cm
 * @returns {[number, number]}
 */
export function depth(dCm, s) {
  const d = Number.isFinite(dCm) ? dCm : 0;
  const k = Number.isFinite(s) ? s : 0;
  return [n(DEPTH_RATIO.x * k * d), n(DEPTH_RATIO.y * k * d)];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The shared hatch def
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The DEFAULT id namespace, used by `fhDef`/`fhRef`/`box`/`room` when a caller names none.
 *
 * ⛔ IT IS NOT THE EMPTY STRING, AND THAT IS THE POINT. The design documents write a bare
 * `<pattern id="fh">` because each is one hand-authored page with exactly one hatch. This kit feeds
 * four surfaces that compose into ONE document, so a bare `fh` is a collision waiting for the
 * second caller — and it would have arrived through the DEFAULT path, which is the path every early
 * P2 fitting takes. `box()` and `room()` defaulted their `hatch` to `url(#fh)` while `fhDef(prefix)`
 * emitted `prefix-fh`, so taking all the defaults produced a reference to an id nothing defined: a
 * silently unpainted side face, never an error. One shared constant closes both halves.
 */
export const DEFAULT_ID_PREFIX = 'ob';

/**
 * The 45° side-face hatch, as ONE `<pattern>` def. `idPrefix` namespaces the id so two surfaces (or
 * two scenes in one document) never collide — the id-collision rule `overview-scene.test.js` pins.
 * Pass the SAME prefix to `fhRef()` and hand the result to `box({ hatch })`, or take the default on
 * both and they agree by construction.
 * @param {string} [idPrefix] e.g. 'rz' → `<pattern id="rz-fh">`; omitted → `<pattern id="ob-fh">`
 */
export function fhDef(idPrefix) {
  const id = fhId(idPrefix);
  return (
    `<pattern id="${esc(id)}" width="${n(HATCH.period)}" height="${n(HATCH.period)}"` +
    ' patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    `<rect width="${n(HATCH.period)}" height="${n(HATCH.period)}" fill="${HATCH.ground}"/>` +
    `<path d="M0 0 L0 ${n(HATCH.period)}" stroke="${HATCH.ink}" stroke-width="${n(HATCH.width)}"` +
    ` opacity="${n(HATCH.opacity)}"/>` +
    '</pattern>'
  );
}

/**
 * The id `fhDef(idPrefix)` writes. An absent, empty, whitespace-only or non-string prefix falls back
 * to `DEFAULT_ID_PREFIX` — NEVER to a bare `fh`, so there is no input that produces the unnamespaced
 * id. `'  rz '` and `'rz'` are the same namespace; a prefix is trimmed, not taken literally.
 */
export function fhId(idPrefix) {
  const p = typeof idPrefix === 'string' ? idPrefix.trim() : '';
  return `${p || DEFAULT_ID_PREFIX}-fh`;
}

/** The paint string for the hatch def of `idPrefix` — hand this to `box({ hatch })`. */
export function fhRef(idPrefix) { return `url(#${fhId(idPrefix)})`; }

// ─────────────────────────────────────────────────────────────────────────────────────────────
// box() — the three-face extrusion every fitting is made of
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The three visible faces of a box standing on the floor line, as `d` attribute strings.
 * `(x, y)` is the FRONT-BOTTOM-LEFT corner — y is the baseline (the floor), and the box rises
 * UPWARD from it, which is why every height term subtracts. Faces are wound the way the design
 * documents wind them (front: top-left → top-right → bottom-right → bottom-left), so a diff against
 * the markup is a diff about geometry rather than about winding.
 * @returns {{front: string, side: string, top: string}}
 */
export function boxFaces(x, y, wCm, hCm, dCm, s) {
  const W = s * wCm, H = s * hCm;
  const [dx, dy] = depth(dCm, s);
  const x0 = x, x1 = x + W, yb = y, yt = y - H;
  return Object.freeze({
    front: poly([[x0, yt], [x1, yt], [x1, yb], [x0, yb]]),
    side:  poly([[x1, yt], [x1 + dx, yt + dy], [x1 + dx, yb + dy], [x1, yb]]),
    top:   poly([[x0, yt], [x1, yt], [x1 + dx, yt + dy], [x0 + dx, yt + dy]]),
  });
}

/**
 * A fitting's body: front face, side face, top face — in that draw order, which is the design's.
 * @param {number} x front-bottom-left x (px)
 * @param {number} y the FLOOR LINE (px); the box rises above it
 * @param {number} wCm width, {number} hCm height, {number} dCm depth — all centimetres
 * @param {number} s px per cm (one of PX_PER_CM)
 * @param {object} [opts]
 *   stroke      ink colour                                   (default INK)
 *   strokeWidth weight, 0.9–2.2 by mass (charter §1)          (default 1.4)
 *   dash        stroke-dasharray, e.g. the dialect's '8 5'    (default none)
 *   sideFill    'hatch' | 'flat' | 'none'                     (default 'hatch')
 *   hatch       the hatch paint for sideFill:'hatch'          (default fhRef() — `url(#ob-fh)`,
 *               the SAME id `fhDef()` writes when it is called without a prefix)
 *   flat        the flat side paint for sideFill:'flat'       (default PAPER_FLAT, thumbnail scale)
 *   front, top  face fill overrides                           (default PAPER)
 *   opacity     applied to all three faces
 * @returns {string} three `<path>` elements
 */
export function box(x, y, wCm, hCm, dCm, s, opts = {}) {
  const o = opts || {};
  const faces = boxFaces(x, y, wCm, hCm, dCm, s);
  const stroke = o.stroke == null ? INK : o.stroke;
  const sw = o.strokeWidth == null ? 1.4 : o.strokeWidth;
  const mode = o.sideFill == null ? 'hatch' : o.sideFill;
  const side =
    mode === 'none' ? 'none'
      : mode === 'flat' ? (o.flat == null ? PAPER_FLAT : o.flat)
        : (o.hatch == null ? fhRef() : o.hatch);
  const front = o.front == null ? PAPER : o.front;
  const top = o.top == null ? PAPER : o.top;
  const tail = attr('stroke', stroke) + attr('stroke-width', sw) +
    attr('stroke-dasharray', o.dash) + attr('opacity', o.opacity);
  return (
    `<path d="${faces.front}" fill="${esc(front)}"${tail}/>` +
    `<path d="${faces.side}" fill="${esc(side)}"${tail}/>` +
    `<path d="${faces.top}" fill="${esc(top)}"${tail}/>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// room() — the Level-2 cutaway, and the frame everything inside it is placed against
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The room's coordinate frame. ROOM SPACE is centimetres with its origin at the FRONT-LEFT corner
 * of the floor: `x` runs right along the front wall, `y` runs back into the room, `z` runs up.
 * `project(xCm, yCm, zCm)` maps that to the SVG's px space, rounded like everything else.
 *
 * P3 and P4 should place doors, fittings, pawns and dimension arrows through `project()` rather
 * than re-deriving the offsets: two derivations of one projection is exactly how the Overview and
 * the Room Zoom came to skin the same glyph two different ways.
 */
export function roomFrame(wM, dM, hM, s, opts = {}) {
  const o = opts || {};
  const wIn = (Number.isFinite(wM) ? wM : 0) * 100;
  const dIn = (Number.isFinite(dM) ? dM : 0) * 100;
  const hCm = (Number.isFinite(hM) ? hM : 0) * 100;
  const k = Number.isFinite(s) ? s : 0;
  const x0 = o.x == null ? 58 : o.x;
  const y0 = o.y == null ? 452 : o.y;
  // ⭐⭐ THE FACING — see `plan` below. `wCm`/`dCm` are the FACED footprint (what is actually drawn),
  // so a caller that measures the frame measures the picture; `wIn`/`dIn` are the authored box the
  // plan map turns inside.
  const f = Number.isFinite(o.facing) ? ((o.facing | 0) & 3) : 0;
  const swapped = (f & 1) === 1;
  const wCm = swapped ? dIn : wIn;
  const dCm = swapped ? wIn : dIn;
  /**
   * ⭐⭐ THE ONE PLACE A QUARTER-TURN HAPPENS — the whole of "rotate the thing" is this map.
   *
   * ⛔ IT IS IN THE FRAME AND NOT IN A BUILDER, AND THAT IS THE DESIGN. A fitting is authored once,
   * in its own centimetres, inside `0..w / 0..d / 0..h` (`fittings.js`'s SPACE header). Rotation
   * SWAPS AND MIRRORS THOSE CENTIMETRES BEFORE THEY ARE PROJECTED, so every builder — thirty of
   * them, ~1200 lines of hand-placed cm points — turns without one of them knowing rotation exists.
   * A per-builder `rotate` would be thirty chances to turn one leg the wrong way, and the design
   * documents' own reason this module has no `rotate` (see the header) is preserved exactly: THE
   * PROJECTION still has none. This is a change of the object's coordinates, not of the camera's.
   *
   * ⭐ AND THE ROUND-THINGS-LEVEL RULE SURVIVES BY CONSTRUCTION, not by being re-checked thirty
   * times. A level ellipse is drawn axis-aligned in SCREEN space from `F.s * rCm`; only its CENTRE
   * comes through here. So a barrel turned 90° is the same barrel in a different place, which is
   * what "a round fitting has no heading and can be set down any way about" means.
   *
   * The map is a clockwise quarter-turn in PLAN (x right, y back into the picture):
   *   0 → (x, y)          1 → (d − y, x)      2 → (w − x, d − y)      3 → (y, w − x)
   * Facing 0 is the identity and returns its arguments untouched, so every existing caller and
   * `oblique.test.js`'s pinned `room()` output are byte-identical.
   */
  const plan = (xCm, yCm) => {
    const x = Number.isFinite(xCm) ? xCm : 0;
    const y = Number.isFinite(yCm) ? yCm : 0;
    if (f === 1) return [dIn - y, x];
    if (f === 2) return [wIn - x, dIn - y];
    if (f === 3) return [y, wIn - x];
    return [x, y];
  };
  const project = (xCm, yCm, zCm) => {
    const [px, py] = plan(xCm, yCm);
    const [dx, dy] = depth(py, k);
    return [n(x0 + k * px + dx), n(y0 - k * (Number.isFinite(zCm) ? zCm : 0) + dy)];
  };
  /**
   * ⭐ THE FACED FOOTPRINT OF AN EXTRUDED BOX — the one thing `project` alone cannot carry.
   *
   * `oblique.box()` draws an AXIS-ALIGNED extrusion from a projected origin plus raw cm extents, so
   * its `w`/`d` never pass through `plan` and a turned bench would keep its unturned footprint —
   * the whole piece in the right place, drawn the wrong way round. This maps the box's plan RECT
   * (all four corners, then the minimum) and swaps its extents on an odd facing, so the caller gets
   * a projected origin and the extents to hand `box()`. ONE derivation, beside the map it depends on.
   *
   * @returns {{x:number, y:number, w:number, d:number}} px origin (front-bottom-left) + faced cm w/d
   */
  const boxAt = (xCm, yCm, zCm, bw, bd) => {
    const w = Number.isFinite(bw) ? bw : 0;
    const d = Number.isFinite(bd) ? bd : 0;
    const a = plan(xCm, yCm);
    const b = plan((Number.isFinite(xCm) ? xCm : 0) + w, (Number.isFinite(yCm) ? yCm : 0) + d);
    const px = Math.min(a[0], b[0]);
    const py = Math.min(a[1], b[1]);
    const [ox, oy] = depth(py, k);
    return {
      x: n(x0 + k * px + ox),
      y: n(y0 - k * (Number.isFinite(zCm) ? zCm : 0) + oy),
      w: swapped ? d : w,
      d: swapped ? w : d,
    };
  };
  return Object.freeze({
    s: k, wCm, dCm, hCm, x0, y0, project, plan, boxAt, facing: f,
    // ⚠️ THE CORNERS ARE THE **AUTHORED** BOX'S, PUT THROUGH `project` — `wIn`/`dIn`, never the
    // faced `wCm`/`dCm`. Feeding the faced extents back into `project` would apply the plan map
    // TWICE and put three of the four corners somewhere that is not a corner of anything. At
    // facing 0 the two spellings are the same number, which is exactly why this is worth writing
    // down: the wrong one is invisible on every existing caller.
    corners: Object.freeze({
      frontLeft:   project(0, 0, 0),
      frontRight:  project(wIn, 0, 0),
      backRight:   project(wIn, dIn, 0),
      backLeft:    project(0, dIn, 0),
      frontLeftTop:  project(0, 0, hCm),
      frontRightTop: project(wIn, 0, hCm),
      backRightTop:  project(wIn, dIn, hCm),
      backLeftTop:   project(0, dIn, hCm),
    }),
  });
}

/**
 * THE ROOM CUTAWAY: floor quad, floor grid, back wall, hatched left wall, the solid front floor
 * edge, and the two DASHED CUT EDGES that say the right wall and the ceiling have been cut away
 * rather than being absent. Draw order is the design's own.
 *
 * Reproduces the galley plate exactly at `room(8.6, 2.8, 2.4, 0.95)`:
 *   floor `M58 452 L875 452 L981.4 292.4 L164.4 292.4 Z`
 *   back  `M164.4 292.4 L981.4 292.4 L981.4 64.4 L164.4 64.4 Z`
 *   left  `M58 452 L164.4 292.4 L164.4 64.4 L58 224 Z`  (fill url(#fh))
 *   cuts  `M875 452 L875 224` and `M875 224 L981.4 64.4`, dashed "7 5"
 *
 * @param {number} wM width in METRES, {number} dM depth, {number} hM height
 * @param {number} s px per cm (PX_PER_CM.room = 0.95 for the Level-2 cutaway)
 * @param {object} [opts]
 *   x, y        the front-left floor corner in px             (default 58, 452 — the design's)
 *   ink, paper  stroke ink / face fill                        (default INK / PAPER)
 *   hatch       the left wall's paint                         (default fhRef() — `url(#ob-fh)`,
 *               the SAME id `fhDef()` writes when it is called without a prefix)
 *   gridCm      floor-grid spacing ACROSS the width, cm       (default 60)
 *   depthDivs   how many bands the floor grid cuts the depth into (default 5)
 *   grid        false to omit the floor grid entirely
 * @returns {string} an SVG fragment
 */
export function room(wM, dM, hM, s, opts = {}) {
  const o = opts || {};
  const f = roomFrame(wM, dM, hM, s, o);
  const P = f.project;
  const ink = o.ink == null ? INK : o.ink;
  const paper = o.paper == null ? PAPER : o.paper;
  const hatch = o.hatch == null ? fhRef() : o.hatch;
  const gridCm = o.gridCm == null ? 60 : o.gridCm;
  const divs = o.depthDivs == null ? 5 : o.depthDivs;
  const c = f.corners;

  const floor = poly([c.frontLeft, c.frontRight, c.backRight, c.backLeft]);
  const back = poly([c.backLeft, c.backRight, c.backRightTop, c.backLeftTop]);
  const left = poly([c.frontLeft, c.backLeft, c.backLeftTop, c.frontLeftTop]);
  const frontEdge = poly([c.frontLeft, c.frontRight], false);
  const cutV = poly([c.frontRight, c.frontRightTop], false);
  const cutD = poly([c.frontRightTop, c.backRightTop], false);

  let gridEl = '';
  if (o.grid !== false && gridCm > 0 && f.wCm > 0 && f.dCm > 0) {
    const segs = [];
    for (let x = gridCm; x < f.wCm; x += gridCm) {
      segs.push(poly([P(x, 0, 0), P(x, f.dCm, 0)], false));
    }
    for (let j = 1; j < divs; j++) {
      const y = (f.dCm * j) / divs;
      segs.push(poly([P(0, y, 0), P(f.wCm, y, 0)], false));
    }
    if (segs.length) {
      gridEl =
        `<g fill="none" stroke="${esc(ink)}" stroke-width="${n(ROOM_WEIGHT.grid)}"` +
        ` opacity="${n(ROOM_WEIGHT.gridOpacity)}"><path d="${segs.join(' ')}"/></g>`;
    }
  }

  return (
    `<path d="${floor}" fill="${esc(paper)}" stroke="none" stroke-width="${n(ROOM_WEIGHT.floor)}"/>` +
    gridEl +
    `<path d="${back}" fill="${esc(paper)}" stroke="${esc(ink)}" stroke-width="${n(ROOM_WEIGHT.wall)}"/>` +
    `<path d="${left}" fill="${esc(hatch)}" stroke="${esc(ink)}" stroke-width="${n(ROOM_WEIGHT.wall)}"/>` +
    `<path d="${frontEdge}" fill="none" stroke="${esc(ink)}" stroke-width="${n(ROOM_WEIGHT.edge)}"/>` +
    `<path d="${cutV}" fill="none" stroke="${esc(ink)}" stroke-width="${n(ROOM_WEIGHT.cut)}"` +
    ` stroke-dasharray="${esc(ROOM_WEIGHT.cutDash)}"/>` +
    `<path d="${cutD}" fill="none" stroke="${esc(ink)}" stroke-width="${n(ROOM_WEIGHT.cut)}"` +
    ` stroke-dasharray="${esc(ROOM_WEIGHT.cutDash)}"/>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// haloText() — a label that survives being drawn over art
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `paint-order="stroke"` paints the stroke UNDER the fill, so a 3.4px paper-coloured stroke reads
 * as a knockout halo rather than an outline. Measured on the design's leader labels
 * (`stroke="#EBE4D1" stroke-width="3.4" paint-order="stroke"`).
 *
 * ⚠️ GLYPHS NOT IN THE TWO SHIPPED FACES (⚠ △ ▮ …) ARE DRAWN AS PATHS, NEVER AS TEXT — see charter
 * §1. A fallback face has different advances, the de-DE box picks a different fallback, and the
 * MOSS `.c-bar` width pins move under you. This helper will happily set one; do not ask it to.
 *
 * @param {string} t the label
 * @param {number} x @param {number} y
 * @param {object} [opts] size(15) · font('serif'|'mono'|literal stack) · fill(ATTEND) ·
 *   anchor('start') · italic(false) · weight · tracking (letter-spacing) · stroke · strokeWidth ·
 *   baseline (dominant-baseline) · opacity
 */
function haloOpenTag(x, y, opts) {
  const o = opts || {};
  const font = o.font === 'mono' ? FONT.mono
    : o.font === 'serif' || o.font == null ? FONT.serif
      : o.font;
  return (
    '<text' + attr('x', x) + attr('y', y) +
    ` text-anchor="${esc(o.anchor == null ? 'start' : o.anchor)}"` +
    attr('dominant-baseline', o.baseline) +
    ` font-family="${esc(font)}"` +
    (o.italic ? ' font-style="italic"' : '') +
    attr('font-size', o.size == null ? 15 : o.size) +
    attr('font-weight', o.weight) +
    attr('letter-spacing', o.tracking) +
    attr('fill', o.fill == null ? ATTEND : o.fill) +
    attr('stroke', o.stroke == null ? HALO.stroke : o.stroke) +
    attr('stroke-width', o.strokeWidth == null ? HALO.width : o.strokeWidth) +
    ` paint-order="${esc(HALO.paintOrder)}"` +
    attr('opacity', o.opacity) +
    '>'
  );
}

export function haloText(t, x, y, opts = {}) {
  return haloOpenTag(x, y, opts) + esc(t) + '</text>';
}

/**
 * THE SAME LABEL, IN RUNS THAT CAN CARRY DIFFERENT INK — one `<text>`, one `<tspan>` per run.
 *
 * ⭐ IT EXISTS BECAUSE OF ONE CHARTER RULE: there is ONE accent (§1), and a label whose LAST CLAUSE
 * is the attention (`… · NO AIR`) must spend the oxblood on that clause and nowhere else. Setting
 * `fill` on the whole `<text>` tints every word — which is what the Room Zoom's stat line did while
 * its own comments claimed otherwise, and no assertion could see the difference because both spellings
 * contain the accent somewhere.
 *
 * A run with no `fill` inherits the `<text>`'s, so a two-clause line costs exactly one `<tspan>`.
 * Runs are ESCAPED, exactly as `haloText`'s single string is: this takes DATA, never markup.
 * PURE.
 *
 * @param {{t:string, fill?:string}[]} runs
 * @param {number} x @param {number} y
 * @param {object} [opts] same as `haloText` — `fill` is the BASE ink every unfilled run takes
 */
export function haloRuns(runs, x, y, opts = {}) {
  const body = (Array.isArray(runs) ? runs : []).map((r) => {
    const t = esc(r && r.t != null ? r.t : '');
    return r && r.fill != null ? `<tspan fill="${esc(r.fill)}">${t}</tspan>` : t;
  }).join('');
  return haloOpenTag(x, y, opts) + body + '</text>';
}

/**
 * The advance width, in px, of `t` set in the kit's MONOSPACE face at `size` with `tracking` letter
 * spacing — the one place this surface estimates how wide a label is going to be.
 *
 * ⚠️ IT IS AN ESTIMATE AND IT IS THE ONLY KIND AVAILABLE HERE: a pure string module cannot measure a
 * font. `ADVANCE` is the Space Mono advance the rest of the client already assumes
 * (`room-model.js`'s count badge, `blocked-overlay.js`'s leader label), declared once so a label that
 * is CLAMPED into a viewBox and a badge that is FITTED to its digits cannot come to disagree about
 * how wide the same eight characters are. SVG's `letter-spacing` adds one advance AFTER every glyph
 * including the last, which is why the term is `len * tracking` and not `(len - 1) * tracking`.
 * PURE.
 */
export const MONO_ADVANCE = 0.62;
export function monoTextWidth(t, size, tracking = 0) {
  const len = String(t == null ? '' : t).length;
  if (!len) return 0;
  const fs = Number.isFinite(size) ? size : 0;
  const tr = Number.isFinite(tracking) ? tracking : 0;
  return n(len * (fs * MONO_ADVANCE + tr));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ghost() — the two-pass ink figure (charter §1 "Pawns", ruling E10)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One element in a ghosted figure. Exactly one of `d` / `ellipse` / `rect` must be set. */
function element(el, { stroke, fill, sw, cap, join, dash, opacity }) {
  const paint = attr('fill', fill) + attr('stroke', stroke) + attr('stroke-width', sw) +
    (cap ? attr('stroke-linecap', cap) : '') + (join ? attr('stroke-linejoin', join) : '') +
    attr('stroke-dasharray', dash) + attr('opacity', opacity);
  if (el.d != null) return `<path d="${esc(el.d)}"${paint}/>`;
  if (el.ellipse) {
    const [cx, cy, rx, ry] = el.ellipse;
    return `<ellipse${attr('cx', cx)}${attr('cy', cy)}${attr('rx', rx)}${attr('ry', ry === undefined ? rx : ry)}${paint}/>`;
  }
  if (el.rect) {
    const [rx0, ry0, rw, rh, rr] = el.rect;
    return `<rect${attr('x', rx0)}${attr('y', ry0)}${attr('width', rw)}${attr('height', rh)}${
      rr ? attr('rx', rr) : ''}${paint}/>`;
  }
  return '';
}

/**
 * Emit ONE path list TWICE: a knockout pass in paper (fill AND stroke `#EBE4D1`, `ink + 3.0` px
 * wide) that carves the figure out of whatever it stands on, then the ink pass in each element's
 * own colour. One source list, two passes — the point of ruling E10 is that a pawn is never drawn
 * from two hand-kept-in-step path lists, which is how a rim-light and its shadow come to disagree.
 *
 * ⚠️ E10 also says: MEASURE the 10 Hz repaint before P5 merges. This doubles the element count of
 * every figure on the board.
 *
 * @param {Array<{d?:string, ellipse?:number[], rect?:number[], sw?:number, stroke?:string,
 *   fill?:string, cap?:string, join?:string, dash?:string, opacity?:number}>} paths
 * ⚠️ `halo: false` emits the INK PASS ALONE. That is not a shortcut a caller may take to save bytes
 * over art — it is the design's own treatment where a figure stands on bare paper with nothing
 * behind it to knock out (`Perilune Game.dc.html` line 261, the crew dock: `fill="none"
 * stroke="#14120F"`, one pass). The option lives here rather than in the caller so a single-pass
 * figure and a two-pass one are still emitted from ONE element writer.
 *
 * @param {object} [opts] knockout('#EBE4D1') · widen(3.0) · ink('#14120F' default per-element
 *   stroke) · sw (default per-element stroke width, 1.2) · halo(true)
 * @returns {string} the knockout `<g>` followed by the ink elements — halo FIRST, always
 */
export function ghost(paths, opts = {}) {
  const o = opts || {};
  const list = Array.isArray(paths) ? paths.filter((p) => p && (p.d != null || p.ellipse || p.rect)) : [];
  if (!list.length) return '';
  const knock = o.knockout == null ? GHOST.knockout : o.knockout;
  const widen = o.widen == null ? GHOST.widen : o.widen;
  const defaultInk = o.ink == null ? INK : o.ink;
  const defaultSw = o.sw == null ? 1.2 : o.sw;

  const halo = o.halo === false ? '' : `<g stroke-linejoin="round" stroke-linecap="round">${
    list.map((p) => element(p, {
      stroke: knock, fill: knock, sw: n((p.sw == null ? defaultSw : p.sw) + widen), cap: 'round',
    })).join('')}</g>`;
  const ink = list.map((p) => element(p, {
    stroke: p.stroke == null ? defaultInk : p.stroke,
    fill: p.fill == null ? 'none' : p.fill,
    sw: n(p.sw == null ? defaultSw : p.sw),
    cap: p.cap == null ? 'round' : p.cap,
    join: p.join,
    dash: p.dash,
    opacity: p.opacity,
  })).join('');

  return halo + ink;
}
