// SHARED GEOMETRY INSTRUMENT for the sketch adoption — used by `sketch-adoption.test.js` and by the
// treated legs the four catalogue suites carry. Not a `.test.js`, so `node --test` does not run it.
//
// ⛔ WHY THE GUARDS NEED A GEOMETRY INSTRUMENT AT ALL, SAID ONCE HERE. Before the treatment, every
// projection guard in `fittings/machines/paper-fixtures/paper-resources.test.js` asked its question
// by looking for a LITERAL projected coordinate in the emitted string — `M148.5 62.3` is either
// there or the member moved. That is exactly the right instrument for ruled geometry and it is
// USELESS against a freehand stroke, which emits no original coordinate at all: every one of those
// scans returns ZERO matches under treatment and therefore agrees, vacuously, with a perfect port
// and with a piece drawn at the wrong scale alike (TRAPS 4th shape — a guard whose scope filter
// excludes the violation). The experiment measured that live: 72 level ellipses became 0.
//
// So the split is: the exact-coordinate guards keep asking the RAW fragment (`{ sketch: false }`),
// which IS the geometry, and this module supplies the bridge — a bounded, both-directions
// statement that the treated drawing is the raw drawing within a derived amplitude. Neither half is
// sufficient alone: the raw legs cannot see what ships, and the bridge cannot see whether the
// projection was right in the first place.

import { sketch, amplitudeBound, GROUND_CLASS } from '../src/render/sketch.js';
import { SKETCH_LEVEL } from '../src/items/helpers.js';

const TAG = /<[^>]*>/g;
const CMD = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;

export function attrsOf(tag) {
  const out = {};
  const re = /([-\w:]+)="([^"]*)"/g;
  let m = re.exec(tag);
  while (m) { out[m[1]] = m[2]; m = re.exec(tag); }
  return out;
}

export function nameOf(tag) {
  const m = /^<\s*\/?\s*([-\w:]+)/.exec(tag);
  return m ? m[1] : '';
}

function nums(s) {
  return (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
}

/** One cubic, sampled. 12 steps: the flattening error of a 5.5-unit bow over 12 chords is < 0.01. */
function cubic(out, p0, c1, c2, p1) {
  for (let i = 1; i <= 12; i += 1) {
    const t = i / 12, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
}

/**
 * A `d` → a list of POLYLINES (one per subpath), curves flattened.
 * `A` is deliberately unsupported: an arc-bearing element is pinned by `arcRadii` instead, exactly,
 * and a silently-wrong arc flattening would be a guard that measures its own bug.
 */
export function flatten(d) {
  const subs = [];
  let cur = null;
  let x = 0, y = 0, sx = 0, sy = 0;
  CMD.lastIndex = 0;
  let m = CMD.exec(d);
  while (m) {
    const c = m[1];
    const a = nums(m[2]);
    if (c === 'M') {
      [x, y] = a; sx = x; sy = y;
      cur = [[x, y]]; subs.push(cur);
      for (let i = 2; i + 1 < a.length; i += 2) { x = a[i]; y = a[i + 1]; cur.push([x, y]); }
    } else if (!cur) {
      return subs;
    } else if (c === 'L') {
      for (let i = 0; i + 1 < a.length; i += 2) { x = a[i]; y = a[i + 1]; cur.push([x, y]); }
    } else if (c === 'H') { for (const v of a) { x = v; cur.push([x, y]); } } else if (c === 'V') {
      for (const v of a) { y = v; cur.push([x, y]); }
    } else if (c === 'C') {
      for (let i = 0; i + 5 < a.length; i += 6) {
        cubic(cur, [x, y], [a[i], a[i + 1]], [a[i + 2], a[i + 3]], [a[i + 4], a[i + 5]]);
        x = a[i + 4]; y = a[i + 5];
      }
    } else if (c === 'Q') {
      for (let i = 0; i + 3 < a.length; i += 4) {
        const c1 = [x + (2 / 3) * (a[i] - x), y + (2 / 3) * (a[i + 1] - y)];
        const c2 = [a[i + 2] + (2 / 3) * (a[i] - a[i + 2]), a[i + 3] + (2 / 3) * (a[i + 1] - a[i + 3])];
        cubic(cur, [x, y], c1, c2, [a[i + 2], a[i + 3]]);
        x = a[i + 2]; y = a[i + 3];
      }
    } else if (c === 'Z' || c === 'z') {
      cur.push([sx, sy]); x = sx; y = sy;
    } else {
      return subs;
    }
    m = CMD.exec(d);
  }
  return subs;
}

/** Squared distance from `p` to the segment `a→b`. */
function d2seg(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L2 = vx * vx + vy * vy;
  let t = L2 > 0 ? (((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2) : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const dx = p[0] - (a[0] + t * vx), dy = p[1] - (a[1] + t * vy);
  return dx * dx + dy * dy;
}

/** The distance from `p` to the nearest point of any polyline in `polys`. */
export function distTo(p, polys) {
  let best = Infinity;
  for (const poly of polys) {
    if (poly.length === 1) {
      const dx = p[0] - poly[0][0], dy = p[1] - poly[0][1];
      best = Math.min(best, dx * dx + dy * dy);
      continue;
    }
    for (let i = 0; i + 1 < poly.length; i += 1) {
      const d = d2seg(p, poly[i], poly[i + 1]);
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** An UNTREATED shape tag → its polylines, in the same local units the treatment writes. */
export function shapePolys(tag) {
  const nm = nameOf(tag);
  const a = attrsOf(tag);
  if (nm === 'rect') {
    const x = +a.x || 0, y = +a.y || 0, w = +a.width || 0, h = +a.height || 0;
    return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
  }
  if (nm === 'line') return [[[+a.x1 || 0, +a.y1 || 0], [+a.x2 || 0, +a.y2 || 0]]];
  if (nm === 'ellipse' || nm === 'circle') {
    const cx = +a.cx || 0, cy = +a.cy || 0;
    const rx = nm === 'circle' ? (+a.r || 0) : (+a.rx || 0);
    const ry = nm === 'circle' ? (+a.r || 0) : (a.ry == null ? rx : +a.ry);
    const pts = [];
    for (let i = 0; i <= 360; i += 1) {
      const t = (i / 360) * Math.PI * 2;
      pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
    }
    return [pts];
  }
  if (nm === 'path' && a.d) return flatten(a.d);
  return [];
}

/**
 * EVERY STROKED PATH in a fragment, with a `<g>`'s inherited `stroke` RESOLVED onto its children.
 *
 * ⚠️ THE INHERITANCE IS THE WHOLE REASON THIS EXISTS. `sketch.js` emits a level's knockout pass as
 * `<g fill="none" stroke="#EBE4D1" …><path d=… stroke-width=…/>…</g>` — the colour is on the GROUP.
 * A scan for `stroke="…"` on the path elements sees NONE of them, so a guard about paper strokes
 * written that way counts a handful of `repaint()` halos and misses the hundreds that actually
 * ship. Measured while writing this: 48 found against 1000+ present.
 */
export function strokedPaths(svg) {
  const out = [];
  const stack = [];
  for (const t of svg.replace(/<defs>[\s\S]*?<\/defs>/g, '').match(TAG) || []) {
    const nm = nameOf(t);
    if (nm === 'g') {
      if (t.startsWith('</')) stack.pop();
      else if (!t.endsWith('/>')) stack.push(attrsOf(t));
      continue;
    }
    if (nm !== 'path') continue;
    const a = attrsOf(t);
    let stroke = a.stroke;
    for (let i = stack.length - 1; i >= 0 && stroke == null; i -= 1) stroke = stack[i].stroke;
    if (!stroke || stroke === 'none') continue;
    out.push({ d: a.d, stroke, width: +a['stroke-width'], tag: t });
  }
  return out;
}

/** Every `d` an emitted chunk carries, minus the appended ground rule. */
export function dsOf(chunk) {
  return (chunk.match(TAG) || [])
    .filter((t) => !t.includes(`class="${GROUND_CLASS}"`))
    .map((t) => attrsOf(t).d)
    .filter((d) => d != null);
}

/** The `A rx ry` pairs in a `d`, in order. */
export function arcRadii(d) {
  return [...d.matchAll(/A\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
}

/** A `d` with every `A rx ry` blanked, so two of them can be compared modulo the lump. */
export function blankArcs(d) {
  return d.replace(/A\s*-?[\d.]+[\s,]+-?[\d.]+/g, 'A<r>');
}

/**
 * THE DRAWN EXTENT of a fragment — max |x|, max |y|, the bounding box, and every mark that set
 * them. Works on a RAW fragment and on a TREATED one alike, which is the point: the box guards
 * can then state ONE rule and run it on both, with the raw tolerance and with raw + the amplitude.
 *
 * ⛔ IT FLATTENS CURVES RATHER THAN SCANNING FOR `M x y`. The pre-treatment box guards read
 * `[MLQ](x) (y)` out of the string, which sees every point of a ruled polygon and exactly ONE point
 * of a freehand cubic — so pointed at treated output it would measure the start of each stroke and
 * nothing else, and a bow that ran 20 units past the tile would be invisible to it.
 */
export function bodyExtent(svg) {
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  let mx = 0, my = 0;
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  const marks = [];
  const ground = [];
  for (const t of body.match(TAG) || []) {
    const nm = nameOf(t);
    if (!['path', 'rect', 'ellipse', 'circle', 'line'].includes(nm)) continue;
    // ⛔ THE GROUND RULE IS NOT PART OF THE OBJECT AND IS SEPARATED HERE BY NAME, NOT BY GUESS. It is
    // the pawns' own faint floor line ported to furniture (`sketch.js`'s sixth tell): a horizontal
    // stroke UNDER the piece spanning its drawn footprint. It is therefore outside the piece's
    // projected box by construction — a machine's box projects to a HEXAGON whose lower-right edge
    // slants up and back, and a level line across the full width leaves it (measured:
    // `reactor-plant`, 39 cm past). Counting it as geometry would make every box guard report a
    // drawing defect that is really a floor mark, which is why `sketch.js` gives it a class.
    if (t.includes(`class="${GROUND_CLASS}"`)) { ground.push(t); continue; }
    const a = attrsOf(t);
    let pts = [];
    if (nm === 'path' && a.d) pts = flatten(a.d).flat();
    else if (nm === 'rect') {
      const x = +a.x || 0, y = +a.y || 0, w = +a.width || 0, h = +a.height || 0;
      pts = [[x, y], [x + w, y + h]];
    } else if (nm === 'ellipse' || nm === 'circle') {
      // ⚠️ SAMPLED ON ITS PERIMETER, NOT ITS BOUNDING-BOX CORNERS. A corner of an ellipse's box is
      // not ink, and against a SLANTED half-plane (a machine's projected box is a hexagon) the
      // difference is real: the ring array's raw drawing reads 4.33 cm outside its own box measured
      // by corners and 0.00 measured by perimeter. Over-reporting a legal drawing is how the next
      // piece gets bent to satisfy the instrument.
      const cx = +a.cx || 0, cy = +a.cy || 0;
      const rx = nm === 'circle' ? (+a.r || 0) : (+a.rx || 0);
      const ry = nm === 'circle' ? (+a.r || 0) : (a.ry == null ? rx : +a.ry);
      pts = [];
      for (let i = 0; i < 72; i += 1) {
        const th = (i / 72) * Math.PI * 2;
        pts.push([cx + Math.cos(th) * rx, cy + Math.sin(th) * ry]);
      }
    } else if (nm === 'line') pts = [[+a.x1 || 0, +a.y1 || 0], [+a.x2 || 0, +a.y2 || 0]];
    for (const [x, y] of pts) {
      if (Math.abs(x) > mx) { mx = Math.abs(x); }
      if (Math.abs(y) > my) { my = Math.abs(y); }
      if (x < bb[0]) bb[0] = x;
      if (y < bb[1]) bb[1] = y;
      if (x > bb[2]) bb[2] = x;
      if (y > bb[3]) bb[3] = y;
      marks.push([x, y, nm]);
    }
  }
  return { mx, my, bb, marks, ground };
}

/** Every mark in `svg`'s body that lies outside `±lim.x` / `±lim.y`, as readable strings. */
export function outsideBox(svg, lim) {
  return bodyExtent(svg).marks
    .filter(([x, y]) => Math.abs(x) > lim.x || Math.abs(y) > lim.y)
    .map(([x, y, nm]) => `${nm}(${x.toFixed(2)}, ${y.toFixed(2)})`);
}

/**
 * ONE PIECE, MEASURED. Runs the SHIPPED treatment over `rawFragment` and pairs every input shape
 * with the chunk that replaced it, via `sketch()`'s own trace seam.
 *
 * @returns {{treated: string, rows: Array<object>}} `rows` classify each shape as
 *   `pass` (fill-only, no pen to make freehand — returned untouched), `penOnly` (a body the
 *   builder already drew as curves or arcs: re-emitted with its OWN `d`, so the treatment spends
 *   only the pen, the caps and — for an `A` — the radius lump), or `geom` (re-drawn freehand, the
 *   class the displacement bound is about), each carrying its measured deviation in BOTH
 *   directions and the bound it is measured against.
 */
export function measurePiece(rawFragment, seed, level = SKETCH_LEVEL) {
  const trace = [];
  const treated = sketch(rawFragment, { level, seed, trace });
  const rows = trace.map((row) => {
    const a = attrsOf(row.src);
    const bound = amplitudeBound(level, row.radius);
    if (row.out == null) return { kind: 'pass', nm: row.nm, fwd: 0, rev: 0, bound, src: row.src, out: row.src, outDs: dsOf(row.src) };
    const outDs = dsOf(row.out);
    // A hand-drawn body (`Q`/`C`) or an arc body is re-emitted with its OWN `d` — the treatment
    // spends only the pen and the caps on it. Both are pinned exactly rather than by a bound.
    if (a.d != null && /[QCAqca]/.test(a.d)) {
      return { kind: 'penOnly', nm: row.nm, src: row.src, srcD: a.d, out: row.out, outDs, bound, fwd: 0, rev: 0 };
    }
    const want = shapePolys(row.src);
    const got = outDs.flatMap((d) => flatten(d));
    let fwd = 0;
    for (const poly of got) for (const p of poly) fwd = Math.max(fwd, distTo(p, want));
    let rev = 0;
    for (const poly of want) for (const p of poly) rev = Math.max(rev, distTo(p, got));
    return { kind: 'geom', nm: row.nm, fwd, rev, bound, src: row.src, out: row.out, outDs };
  });
  return { treated, rows };
}

/**
 * THE POINTS OF `pts` THAT NO MARK IN `basePolys` COMES WITHIN `tol` OF.
 *
 * ⭐ THIS IS THE TWIN-DISTINGUISHABILITY INSTRUMENT AND ITS THRESHOLD IS NOT A TASTE. `tol` is the
 * treatment's own amplitude bound, so a point further than `tol` from every mark of the pristine
 * drawing CANNOT be the same mark drawn by a different hand — by construction of that bound. What
 * is left is damage. A metric that merely counted differing bytes would be satisfied by two
 * different wobbles of one identical drawing, which is exactly the failure mode the owner's
 * `strong` choice makes plausible.
 *
 * Base marks are resampled to `tol/4` and hashed into `tol`-sized cells, so the answer is exact to
 * a quarter of the tolerance and the cost is linear rather than |pts| × |segments|.
 */
export function farFrom(basePolys, pts, tol) {
  const step = tol / 4;
  const grid = new Map();
  const put = (x, y) => {
    const k = `${Math.floor(x / tol)},${Math.floor(y / tol)}`;
    let a = grid.get(k);
    if (!a) { a = []; grid.set(k, a); }
    a.push([x, y]);
  };
  for (const poly of basePolys) {
    for (let i = 0; i < poly.length; i += 1) {
      put(poly[i][0], poly[i][1]);
      if (i + 1 >= poly.length) continue;
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[i + 1];
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
      for (let k = 1; k < n; k += 1) put(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    }
  }
  const far = [];
  for (const p of pts) {
    const cx = Math.floor(p[0] / tol);
    const cy = Math.floor(p[1] / tol);
    let ok = false;
    for (let i = -1; i <= 1 && !ok; i += 1) {
      for (let j = -1; j <= 1 && !ok; j += 1) {
        const a = grid.get(`${cx + i},${cy + j}`);
        if (!a) continue;
        for (const q of a) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol) { ok = true; break; } }
      }
    }
    if (!ok) far.push(p);
  }
  return far;
}

/** Every drawn point of a fragment's body, curves flattened, the ground rule excluded. */
export function inkPolys(svg) {
  const out = [];
  for (const t of svg.replace(/<defs>[\s\S]*?<\/defs>/g, '').match(TAG) || []) {
    if (t.includes(`class="${GROUND_CLASS}"`)) continue;
    const nm = nameOf(t);
    if (!['path', 'rect', 'ellipse', 'circle', 'line'].includes(nm)) continue;
    for (const poly of shapePolys(t)) if (poly.length) out.push(poly);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE INVISIBLE-INK PROBE, UNDER TREATMENT
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⭐ THE SUBJECT IS THE SOURCE MEMBER, NOT THE TREATMENT'S PER-EDGE DECOMPOSITION, AND THAT IS A
// FINDING RATHER THAN A CONVENIENCE. `sketch()` turns one closed quad into four independent
// freehand runs, so a probe pointed at the emitted elements silently starts asking "is this EDGE
// buried" where it used to ask "is this MEMBER buried" — and the answer changes. Measured on
// `door-sliding`: the left jamb's top face has its BACK edge under the header's own front face,
// which is correct painter's-algorithm occlusion on a closed quad and which the raw probe rightly
// passes; split into four runs, that one edge reads as a fully covered member and the guard
// condemns correct art. Regrouping by source element keeps the question the question it was.

/** True when this element's paint really covers what is under it. */
function opaqueTail(tag) {
  if (/fill="none"/.test(tag)) return false;
  const op = tag.match(/opacity="([\d.]+)"/);
  if (op && +op[1] < 0.99) return false;
  return /fill="(#|url\()/.test(tag);
}

function inPolygon(poly, [x, y]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Every SOURCE member of a measured piece whose ink a LATER opaque face covers entirely.
 *
 * @param {Array<object>} rows `measurePiece(...).rows`
 * @param {{raw?: boolean}} [opts] `raw: true` measures the UNTREATED geometry of the same members,
 *   which is what makes a hit ATTRIBUTABLE: run both and a difference is the treatment's doing,
 *   while an identical answer says the finding was in the drawing before it.
 * @returns {{buried: string[], members: number}}
 */
export function buriedMembers(rows, opts = {}) {
  const els = [];
  for (const r of rows) {
    const a = attrsOf(r.src);
    if (opaqueTail(r.src)) {
      if (a.d && /Z\s*$/.test(a.d.trim())) els.push({ area: true, pts: flatten(a.d).flat() });
      else if (r.nm === 'rect' || r.nm === 'ellipse' || r.nm === 'circle') {
        els.push({ area: true, pts: shapePolys(r.src).flat() });
      }
      continue;
    }
    const pts = opts.raw
      ? shapePolys(r.src).flat()
      : (r.outDs || []).flatMap((d) => flatten(d).flat());
    if (pts.length) els.push({ stroke: true, pts, d: a.d || r.src.slice(0, 60) });
  }
  const buried = [];
  let members = 0;
  for (let i = 0; i < els.length; i += 1) {
    if (!els[i].stroke) continue;
    members += 1;
    for (let j = i + 1; j < els.length; j += 1) {
      if (!els[j].area) continue;
      if (els[i].pts.every((p) => inPolygon(els[j].pts, p))) { buried.push(els[i].d); break; }
    }
  }
  return { buried, members };
}

/**
 * Every KNOCKOUT (paper) stroke in a measured piece that has no ink over the same `d`, narrower.
 * A knockout is a widening UNDER a line; one with nothing on top is paper on paper — a deletion.
 *
 * ⚠️ MEMBERS THE BUILDER ITSELF DREW IN PAPER ARE EXCLUDED, BY NAME AND FOR A REASON. `hull-port`'s
 * glass is the one ink-FILLED area in the paper set and its stars are knocked out of that night, so
 * a paper line there is the most visible mark on the piece. What the treatment owes is narrower and
 * is the rule that means something: it may not introduce a paper stroke where the builder drew ink.
 */
export function unbackedKnockouts(rows, paper, inkPaints) {
  const bad = [];
  let count = 0;
  for (const r of rows) {
    if (r.kind === 'pass') continue;
    if (attrsOf(r.src).stroke === paper) continue;
    const widest = new Map();
    for (const p of strokedPaths(`<g>${r.out}</g>`)) {
      const k = `${p.stroke}|${p.d}`;
      widest.set(k, Math.max(widest.get(k) == null ? 0 : widest.get(k), p.width));
    }
    for (const [k, w] of widest) {
      if (!k.startsWith(`${paper}|`)) continue;
      count += 1;
      const d = k.slice(paper.length + 1);
      let over = null;
      for (const paint of inkPaints) {
        const v = widest.get(`${paint}|${d}`);
        if (v != null) over = over == null ? v : Math.max(over, v);
      }
      if (over == null || !(w > over)) bad.push(`${d.slice(0, 46)}… paper ${w} over ${over}`);
    }
  }
  return { bad, count };
}
