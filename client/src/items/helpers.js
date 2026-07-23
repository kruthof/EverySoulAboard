// Shared SVG-string helpers for the parametric warm ITEM LIBRARY (client/src/items/*).
//
// Every item builder is a PURE function `(opts) -> string` returning an SVG `<g>…</g>` FRAGMENT
// (never a whole <svg>), normalised to a unit tile box. This module gives the builders a tiny
// deterministic string DSL: gradients / radial glows / patterns are collected into a <defs> block
// whose ids are NAMESPACED by the caller's `idPrefix`, so the same item placed many times on one
// canvas never collides. No DOM, no clock, no randomness — same input ⇒ byte-identical output.
//
// Coordinate model: builders author geometry in the mock's own pixel space, CENTRED on (0,0)
// (the mock centres every `.obj` at its anchor with translate(-50%,-50%)). `scene.render(w,h)`
// wraps that body in `translate(w/2,h/2) scale(min(w,h)/TILE)` so a piece drops into any unit
// tile box while keeping the mock's proportions. TILE is the design footprint the art was drawn
// against (≈ the 106px max mock element + glow headroom). Gradients use the default objectBounding
// Box units, so they are independent of the scale transform; patterns/glyphs use the local space.
//
// Authority for all geometry + colour: docs/design/perilune-item-set.dc.html.

/** The design footprint (mock px) a builder's centred body is scaled against. */
export const TILE = 128;

/** Round to 3 dp and normalise -0 → 0 so output is stable and compact. */
export function r3(n) {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
}

// ── gradient vectors (CSS default is TOP→BOTTOM; SVG default is LEFT→RIGHT) ──
const DIRS = {
  v: [0, 0, 0, 1], // linear-gradient(#a,#b)           — vertical
  h: [0, 0, 1, 0], // linear-gradient(90deg,#a,#b)     — horizontal
  diag: [0, 0, 1, 1], // linear-gradient(135deg,#a,#b) — top-left → bottom-right
};

/** A single gradient stop: [offset, color] or [offset, color, opacity]. */
function stopStr([offset, color, opacity]) {
  const op = opacity == null ? '' : ` stop-opacity="${opacity}"`;
  return `<stop offset="${r3(offset)}" stop-color="${color}"${op}/>`;
}

function linGrad(id, stops, dir) {
  const [x1, y1, x2, y2] = DIRS[dir] || DIRS.v;
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(stopStr)
    .join('')}</linearGradient>`;
}

function radGrad(id, stops, { cx = 0.5, cy = 0.5, r = 0.5 } = {}) {
  return `<radialGradient id="${id}" cx="${r3(cx)}" cy="${r3(cy)}" r="${r3(r)}">${stops
    .map(stopStr)
    .join('')}</radialGradient>`;
}

function patternDef(id, inner, { w, h, transform }) {
  const t = transform ? ` patternTransform="${transform}"` : '';
  return `<pattern id="${id}" width="${r3(w)}" height="${r3(h)}" patternUnits="userSpaceOnUse"${t}>${inner}</pattern>`;
}

/** rgba(r,g,b,a) / rgb(r,g,b) → the same colour at alpha 0 (for a glow's outer stop). */
export function fadeZero(color) {
  const m = color.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').slice(0, 3).map((s) => s.trim());
    return `rgba(${parts.join(',')},0)`;
  }
  return color; // hex etc — fall back to a same-colour zero via opacity at the callsite
}

function attr(name, val) {
  return val == null ? '' : ` ${name}="${typeof val === 'number' ? r3(val) : val}"`;
}

function paintAttrs({ fill = 'none', stroke, sw, opacity } = {}) {
  return (
    attr('fill', fill) +
    attr('stroke', stroke) +
    (stroke ? attr('stroke-width', sw == null ? 1 : sw) : '') +
    attr('opacity', opacity)
  );
}

/**
 * A rounded-rect path with per-corner radii. `x,y` = top-left, `w,h` = size.
 * corners: { tl, tr, br, bl } (any omitted = 0). Used for asymmetric CSS border-radius.
 */
export function roundedRectPath(x, y, w, h, { tl = 0, tr = 0, br = 0, bl = 0 } = {}) {
  const R = (v) => r3(Math.min(v, w / 2, h / 2));
  const [a, b, c, d] = [R(tl), R(tr), R(br), R(bl)];
  return (
    `M${r3(x + a)},${r3(y)}` +
    `H${r3(x + w - b)}` +
    (b ? `A${b},${b} 0 0 1 ${r3(x + w)},${r3(y + b)}` : '') +
    `V${r3(y + h - c)}` +
    (c ? `A${c},${c} 0 0 1 ${r3(x + w - c)},${r3(y + h)}` : '') +
    `H${r3(x + d)}` +
    (d ? `A${d},${d} 0 0 1 ${r3(x)},${r3(y + h - d)}` : '') +
    `V${r3(y + a)}` +
    (a ? `A${a},${a} 0 0 1 ${r3(x + a)},${r3(y)}` : '') +
    'Z'
  );
}

/**
 * Create a drawing scene bound to `idPrefix`. Builders call the methods in DRAW ORDER (first call
 * is drawn first / lowest); gradient/pattern/glow methods register a uniquely-numbered def and
 * return a `url(#…)` paint; shape methods push a shape and return the scene for chaining.
 */
export function scene(idPrefix) {
  const defs = [];
  const body = [];
  let n = 0;
  const nid = () => `${idPrefix}__${n++}`;

  const api = {
    /** Register a linearGradient, return its url(#…). dir ∈ 'v'|'h'|'diag'. */
    lin(stops, dir = 'v') {
      const id = nid();
      defs.push(linGrad(id, stops, dir));
      return `url(#${id})`;
    },
    /** Register a radialGradient, return its url(#…). */
    rad(stops, opts) {
      const id = nid();
      defs.push(radGrad(id, stops, opts));
      return `url(#${id})`;
    },
    /** Register a userSpace pattern, return its url(#…). */
    pat(inner, opts) {
      const id = nid();
      defs.push(patternDef(id, inner, opts));
      return `url(#${id})`;
    },
    raw(s) {
      body.push(s);
      return api;
    },
    rect(o) {
      body.push(
        `<rect${attr('x', o.x)}${attr('y', o.y)}${attr('width', o.w)}${attr('height', o.h)}${
          o.rx ? attr('rx', o.rx) : ''
        }${paintAttrs(o)}/>`,
      );
      return api;
    },
    /** An inner border ring (CSS `inset 0 0 0 Npx color`): a stroke inset by width/2. */
    border({ x, y, w, h, rx = 0, color, width = 2 }) {
      const i = width / 2;
      return api.rect({
        x: x + i,
        y: y + i,
        w: w - width,
        h: h - width,
        rx: Math.max(0, rx - i),
        stroke: color,
        sw: width,
      });
    },
    circle(o) {
      body.push(`<circle${attr('cx', o.cx)}${attr('cy', o.cy)}${attr('r', o.r)}${paintAttrs(o)}/>`);
      return api;
    },
    ellipse(o) {
      body.push(
        `<ellipse${attr('cx', o.cx)}${attr('cy', o.cy)}${attr('rx', o.rx)}${attr('ry', o.ry)}${paintAttrs(o)}/>`,
      );
      return api;
    },
    line(o) {
      body.push(
        `<line${attr('x1', o.x1)}${attr('y1', o.y1)}${attr('x2', o.x2)}${attr('y2', o.y2)}${attr(
          'stroke',
          o.stroke,
        )}${attr('stroke-width', o.sw == null ? 1 : o.sw)}${o.cap ? attr('stroke-linecap', o.cap) : ''}/>`,
      );
      return api;
    },
    path(d, o = {}) {
      body.push(`<path d="${d}"${paintAttrs(o)}${o.dash ? attr('stroke-dasharray', o.dash) : ''}/>`);
      return api;
    },
    text(t, o) {
      body.push(
        `<text${attr('x', o.x)}${attr('y', o.y)} text-anchor="middle" dominant-baseline="central"` +
          ` font-family="'Space Mono', ui-monospace, monospace"${attr('font-size', o.size)}${
            o.weight ? attr('font-weight', o.weight) : ''
          }${attr('fill', o.fill)}>${t}</text>`,
      );
      return api;
    },
    /**
     * A soft radial glow (CSS box-shadow blur+spread): an ellipse filled with a colour→transparent
     * radial. `rgba` is the shadow colour at centre; `mult` scales its centre alpha (0 = no glow,
     * e.g. an unpowered device). Draw BEFORE the lit element so it sits behind it.
     */
    glow(cx, cy, rx, rgba, mult = 1, ry = rx) {
      if (mult <= 0) return api;
      const id = nid();
      const m = rgba.match(/^rgba?\(([^)]+)\)$/i);
      let centre = rgba;
      if (m && mult !== 1) {
        const p = m[1].split(',').map((s) => s.trim());
        const a = (p.length > 3 ? parseFloat(p[3]) : 1) * mult;
        centre = `rgba(${p[0]},${p[1]},${p[2]},${r3(a)})`;
      }
      defs.push(
        radGrad(id, [
          [0, centre],
          [0.6, centre],
          [1, fadeZero(rgba)],
        ]),
      );
      body.push(
        `<ellipse cx="${r3(cx)}" cy="${r3(cy)}" rx="${r3(rx)}" ry="${r3(ry)}" fill="url(#${id})"/>`,
      );
      return api;
    },
    /**
     * Fill an area with alternating vertical (dir 'v') or horizontal (dir 'h') bars of `band` px,
     * keeping the container's rounded corners: base rounded rect of colors[0], then colors[1] bars
     * over every other band. Faithful to the mock's repeating-linear-gradient stripes.
     */
    stripes({ x, y, w, h, rx = 0, dir = 'v', band, colors }) {
      api.rect({ x, y, w, h, rx, fill: colors[0] });
      const span = dir === 'v' ? w : h;
      for (let off = band; off < span; off += band * 2) {
        if (dir === 'v') {
          api.rect({ x: x + off, y, w: Math.min(band, w - off), h, fill: colors[1] });
        } else {
          api.rect({ x, y: y + off, w, h: Math.min(band, h - off), fill: colors[1] });
        }
      }
      return api;
    },
    /** Finish: wrap the collected defs+body into a tile-normalised <g> fragment. */
    render(w, h) {
      const k = Math.min(w, h) / TILE;
      const d = defs.length ? `<defs>${defs.join('')}</defs>` : '';
      return `<g class="pl-item">${d}<g transform="translate(${r3(w / 2)} ${r3(
        h / 2,
      )}) scale(${r3(k)})">${body.join('')}</g></g>`;
    },
  };
  return api;
}

/**
 * Builder harness: resolves `{w,h,idPrefix,index,state}`, defaults the id prefix deterministically
 * from the item id (+ index), runs `paint(scene, env)`, and returns the tile-normalised fragment.
 */
export function item(itemId, opts, paint) {
  const w = opts.w == null ? 100 : opts.w;
  const h = opts.h == null ? 100 : opts.h;
  const index = opts.index == null ? 0 : opts.index;
  const idPrefix = opts.idPrefix || `${itemId}-${index}`;
  const s = scene(idPrefix);
  paint(s, { w, h, state: opts.state, powered: opts.state !== 'off' && opts.state !== 'unpowered' });
  return s.render(w, h);
}
