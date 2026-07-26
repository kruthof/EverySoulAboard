// PURE model for click-drag build placement (the RimWorld-style "hold the mouse and sweep a run of
// walls" interaction). Given a drag from a START tile to the CURRENT tile plus a drag MODE, it
// computes the ordered set of target tiles and an orientation hint the live preview captions with.
//
//   walls  → the PERIMETER of the dragged rectangle. A 1-wide or 1-tall rectangle degenerates to a
//            straight run (a horizontal or vertical wall); a wider drag traces the outline, so one
//            sweep can enclose a room. Interior tiles are left open.
//   floors → the FILLED rectangle (re-material every tile in the box).
//   single → just the end tile (doors + any non-drag tool; also what a plain click yields).
//
// `dragModeForTool` below maps only the BUILD palette. The Room Zoom's two ORDER verbs (DIG / STRIP,
// console-retirement WP-4) also sweep, and they take `'fill'` — a designation is a region of intent,
// and `'perimeter'` would leave the middle of a swept wreck untouched. That mapping deliberately does
// NOT live here: it is a Room-Zoom palette decision and it sits with the rest of that palette's
// classification, in `room-model.js`'s `roomDragMode`, which defers to this function for every
// non-order tool. This file stays the pure GEOMETRY and knows nothing about designations.
//
// start == end (a plain click, no travel) yields EXACTLY ONE tile for every mode, so the single-click
// build path is just the degenerate drag. Row-major deterministic ordering, so the preview overlay and
// the committed designations are stable and reproducible. No DOM, no wire, no mutation. Integer math +
// ASCII only (InvariantCulture-safe).

/** Drag mode for a palette tool: wall → 'perimeter', floor → 'fill', everything else → 'single'. PURE. */
export function dragModeForTool(tool) {
  if (tool === 'wall') return 'perimeter';
  if (tool === 'floor') return 'fill';
  return 'single';
}

/** The inclusive bounding rectangle of two tiles, normalised so x0≤x1, y0≤y1. PURE. */
export function dragRect(a, b) {
  const ax = a.x | 0, ay = a.y | 0, bx = b.x | 0, by = b.y | 0;
  const x0 = ax < bx ? ax : bx, x1 = ax < bx ? bx : ax;
  const y0 = ay < by ? ay : by, y1 = ay < by ? by : ay;
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * The target tiles for a drag from `start` to `end` under `mode` ('perimeter'|'fill'|'single').
 * Optional `bounds` {x,y,w,h} clips tiles to a region (the room rect / frame) — tiles outside are
 * dropped, so a drag can never designate outside the room. Returns
 *   { tiles:[{x,y}], orientation:'single'|'h'|'v'|'rect', rect:{x0,y0,x1,y1,w,h}|null }
 * in row-major order. PURE — never mutates its arguments.
 * @param {{x:number,y:number}|null} start
 * @param {{x:number,y:number}|null} end
 * @param {'perimeter'|'fill'|'single'} mode
 * @param {{x:number,y:number,w:number,h:number}} [bounds]
 */
export function buildDragTiles(start, end, mode, bounds) {
  const s = start || end, e = end || start;
  if (!s || !e) return { tiles: [], orientation: 'single', rect: null };
  const r = dragRect(s, e);
  const inB = (x, y) => !bounds ||
    (x >= (bounds.x | 0) && y >= (bounds.y | 0) &&
     x < (bounds.x | 0) + (bounds.w | 0) && y < (bounds.y | 0) + (bounds.h | 0));

  const tiles = [];
  if (mode === 'single') {
    const ex = e.x | 0, ey = e.y | 0;
    if (inB(ex, ey)) tiles.push({ x: ex, y: ey });
    return { tiles, orientation: 'single', rect: r };
  }

  const perimeterOnly = mode === 'perimeter';
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      // For walls, keep only the border ring; floors keep the whole box.
      if (perimeterOnly && x !== r.x0 && x !== r.x1 && y !== r.y0 && y !== r.y1) continue;
      if (inB(x, y)) tiles.push({ x, y });
    }
  }
  const orientation = (r.w === 1 && r.h === 1) ? 'single' : (r.h === 1) ? 'h' : (r.w === 1) ? 'v' : 'rect';
  return { tiles, orientation, rect: r };
}

/** A short human caption for a drag result (preview label). PURE. */
export function dragCaption(result) {
  if (!result || !result.tiles.length) return '';
  const n = result.tiles.length;
  const noun = n === 1 ? 'TILE' : 'TILES';
  switch (result.orientation) {
    case 'h': return 'HORIZONTAL RUN · ' + n + ' ' + noun;
    case 'v': return 'VERTICAL RUN · ' + n + ' ' + noun;
    case 'rect': return result.rect.w + '×' + result.rect.h + ' · ' + n + ' ' + noun;
    default: return n + ' ' + noun;
  }
}
